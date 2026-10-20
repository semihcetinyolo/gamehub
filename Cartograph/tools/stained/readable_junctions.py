"""Readable junction geometry: separate vertex fans, preserving through-lines.

Derived from the user-approved eight-level pilot. This module edits geometry
only; callers must finish colouring/clues and refresh artwork before publishing.
"""
import math
from collections import defaultdict
import numpy as np
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import unary_union, substring
from shapely import affinity

import geom
from contact_policy import from_lines
from make_maps import region_polys, shape_poly
from junction_pilot import junctions, reindex, drag
from audit_geometry import inspect as geometry_inspect


def inspect(m):
    # Construction may contain other unresolved junctions; the final audit
    # rejects them after the whole drawing has been repaired.
    return geometry_inspect(m,allow_junctions=True)


def complexity(m):
    return sum(n-3 for _,n in junctions(m))


class Network:
    def __init__(self,m):
        self.m=m;self.outline=shape_poly(m);self.polys=region_polys(m)
        self.pieces=geom._pieces(self.outline,[LineString([e[:2],e[2:4]]) for e in m['edges']])
        self.ends=defaultdict(list)
        self.rim=set()
        for i,line in enumerate(self.pieces):
            cs=list(line.coords)
            if line.within(self.outline.exterior.buffer(.002)):self.rim.add(i)
            if cs[0]!=cs[-1]:
                self.ends[cs[0]].append((i,cs,False));self.ends[cs[-1]].append((i,cs[::-1],True))

    def rebuild(self,changed,extra=()):
        lines=[LineString(changed.get(i,list(l.coords))) for i,l in enumerate(self.pieces) if i not in self.rim]
        candidate=from_lines(self.outline,[*lines,*extra],self.m['cols'],self.m['rows'],merge=False).to_map()
        return reindex(candidate,self.m)

    def split(self,ops):
        """Each op moves one stem to a shared vertex inserted on a neighbour."""
        inserts=defaultdict(list);moves=defaultdict(dict);locations=[]
        for p,stem,anchor,distance in ops:
            ends=self.ends[p];si,cs,reverse=ends[stem];ai,acs,arev=ends[anchor]
            if si in self.rim or si==ai:raise ValueError('Protected rim or loop')
            axis=LineString(acs)
            if axis.length<distance+.30:raise ValueError('Next junction too close')
            q=axis.interpolate(distance);target=(round(q.x,3),round(q.y,3))
            if math.dist(p,target)<distance*.90:raise ValueError('Curve folds back')
            # Match this exact rounded vertex in the anchor and moved stem.
            d=self.pieces[ai].length-distance if arev else distance
            inserts[ai].append((d,target));moves[si][reverse]=target
            locations.append(dict(point=p,ends=[p,target],span=distance))
        if set(inserts)&set(moves):raise ValueError('Coupled nearby changes')
        changed={}
        for i,points in inserts.items():
            line=self.pieces[i];cs=[];last=0
            for d,target in sorted(points):
                part=list(substring(line,last,d).coords)
                if cs:part[0]=cs[-1]
                cs.extend(part[1:] if cs else part);cs[-1]=target;last=d
            tail=list(substring(line,last,line.length).coords);tail[0]=cs[-1];cs.extend(tail[1:]);changed[i]=cs
        for i,ends in moves.items():
            cs=list(self.pieces[i].coords)
            for reverse,target in ends.items():
                if reverse:cs=cs[::-1]
                cs=drag(cs,target)
                if reverse:cs=cs[::-1]
            changed[i]=cs
        return self.rebuild(changed),locations

    def centred_split(self,p,span):
        ends=self.ends[p];left=[];right=[];axis=[]
        for j,(_,cs,_) in enumerate(ends):
            line=LineString(cs);q=line.interpolate(min(.35,line.length*.5));dx=q.x-p[0]
            (left if dx<-.025 else right if dx>.025 else axis).append(j)
        if len(left)!=len(right) or len(left)<2 or len(axis)>1:raise ValueError('Not a symmetric fan')
        changed={};qs=[]
        for group,sign in [(left,-1),(right,1)]:
            target=(round(p[0]+sign*span/2,3),p[1]);qs.append(target)
            for j in group:
                i,cs,reverse=ends[j]
                if i in self.rim:raise ValueError('Rim fan')
                cs=drag(cs,target);changed[i]=cs[::-1] if reverse else cs
        cm=self.rebuild(changed,[LineString([qs[0],p,qs[1]])])
        return cm,[dict(point=p,ends=qs,span=span,method='mirrored T fan')]


def mirror_op(net,p,stem,anchor,distance,cx):
    reflected=(round(2*cx-p[0],3),p[1]);q=min(net.ends,key=lambda q:math.dist(q,reflected))
    if math.dist(q,reflected)>.012 or len(net.ends[q])<4:raise ValueError('Missing mirrored crossing')
    def match(index):
        _,cs,_=net.ends[p][index];line=LineString(cs);sample=line.interpolate(min(.4,line.length*.5));target=Point(2*cx-sample.x,sample.y)
        distances=[LineString(ocs).distance(target) for _,ocs,_ in net.ends[q]]
        j=int(np.argmin(distances))
        if distances[j]>.04:raise ValueError('Missing mirrored branch')
        return j
    return q,match(stem),match(anchor),distance


def candidate_ok(cm,m,before_complexity):
    if complexity(cm)>=before_complexity:return False
    if inspect(cm):return False
    before={(i,j) for i,ns in enumerate(m['adj']) for j in ns if i<j}
    after={(i,j) for i,ns in enumerate(cm['adj']) for j in ns if i<j}
    return not before-after


def preserves_boundary(m, immutable):
    if immutable is None or immutable.is_empty:return True
    network=unary_union([LineString([e[:2],e[2:4]]) for e in m['edges']+m['rim']])
    return immutable.difference(network.buffer(.003)).length<.015


def repair(m,solution,protected=None,mirror_x=None,passes=2,immutable=None):
    """Greedy local fans; unresolved joints remain explicit for source refinement."""
    history=[];span=max(.52,m['cols']*10/300)
    for attempt in range(passes):
        progressed=False
        for p,degree in junctions(m):
            if not any(q==p for q,_ in junctions(m)):continue
            net=Network(m);ends=net.ends[p];base=complexity(m)
            if len(ends)!=degree:continue
            options=[]
            centred=mirror_x is not None and abs(p[0]-mirror_x)<.012
            if True:
                directions=[];protection=[]
                zone=protected.buffer(.12) if protected is not None else None
                for j,(idx,cs,_) in enumerate(ends):
                    line=LineString(cs);q=line.interpolate(min(.35,line.length*.5))
                    directions.append((math.atan2(q.y-p[1],q.x-p[0]),j))
                    part=substring(line,0,min(1,line.length))
                    protection.append(part.intersection(zone).length/part.length if zone is not None else 0)
                order=[j for angle,j in sorted(directions)]
                proposals=[]
                for k,stem in enumerate(order):
                    if ends[stem][0] in net.rim:continue
                    for anchor in [order[k-1],order[(k+1)%len(order)]]:
                        proposals.append((protection[stem]*100,stem,anchor))
                for penalty,stem,anchor in sorted(proposals):
                    # Soft proximity is a preference, not a silhouette lock.
                    # A background/internal stem can lie close to a subject tip.
                    # Test the actual immutable edge and the complete result.
                    if immutable is not None:
                        branch=LineString(ends[stem][1])
                        if branch.intersection(immutable).length>.015:continue
                    # Once a protected-shape-preserving option works, don't bend
                    # the subject merely for a slightly nicer colour assignment.
                    if options and penalty>min(o[0] for o in options)+25:continue
                    distances=[span*.5,span] if centred else ([span] if attempt==0 else [span,span*1.4])
                    for distance in distances:
                        try:
                            ops=[(p,stem,anchor,distance)]
                            if mirror_x is not None:
                                reflected=(round(2*mirror_x-p[0],3),p[1])
                                if any(math.dist(q,reflected)<.012 and len(e)>=4 for q,e in net.ends.items()):
                                    mirrored=mirror_op(net,p,stem,anchor,distance,mirror_x)
                                    if centred and (mirrored[1]==stem or mirrored[2]==anchor):continue
                                    ops.append(mirrored)
                            cm,detail=net.split(ops)
                            if not preserves_boundary(cm,immutable):continue
                            if centred and math.dist(detail[0]['ends'][1],detail[1]['ends'][1])<span*.90:continue
                            if not candidate_ok(cm,m,base):continue
                            conflicts=sum(solution[i]==solution[j] for i,ns in enumerate(cm['adj']) for j in ns if i<j)
                            displacement=sum(a.symmetric_difference(b).area for a,b in zip(net.polys,region_polys(cm)))
                            score=penalty+conflicts*3+displacement
                            options.append((score,cm,detail))
                        except (ValueError,AssertionError,RuntimeError,shapely.errors.GEOSException):continue
            if centred and not options and immutable is None:
                for distance in [span,span*1.4]:
                    try:
                        cm,detail=net.centred_split(p,distance)
                        if candidate_ok(cm,m,base):options.append((1000,cm,detail))
                    except (ValueError,AssertionError,RuntimeError,shapely.errors.GEOSException):pass
            if options:
                _,m,details=min(options,key=lambda o:o[0]);history.extend(details);progressed=True
        if not progressed and attempt>0:break
    return m,history


def renumber_variable(m,old,old_solution):
    """Map surviving panes by overlap after removing a dispensable divider."""
    ps=region_polys(m);before=region_polys(old)
    overlaps=np.array([[p.intersection(q).area for q in before] for p in ps])
    owners=np.argmax(overlaps,axis=1)
    ordered=sorted(range(len(ps)),key=lambda r:(int(owners[r]),-overlaps[r,owners[r]]))
    remap={r:i for i,r in enumerate(ordered)}
    result=dict(m)
    for field in ['paths','anchors','area','clearance']:
        if field in m:result[field]=[m[field][r] for r in ordered]
    result['adj']=[sorted(remap[j] for j in m['adj'][r]) for r in ordered]
    for field in ['edges','rim']:result[field]=[[*e[:4],*[remap[r] for r in e[4:]]] for e in m[field]]
    result.pop('preferred',None)
    return result,[old_solution[int(owners[r])] for r in ordered]


def remove_divider(m,solution,p,protected=None,mirror_x=None,minimum_count=12,immutable=None):
    """Remove a dispensable seam at a crowded fan, keeping complete subject edges."""
    ps=region_polys(m);outline=shape_poly(m);base=complexity(m)
    pairs=set()
    for e in m['edges']:
        if math.dist(e[:2],p)<.003 or math.dist(e[2:4],p)<.003:pairs.add(tuple(sorted(e[4:])))
    options=[];zone=protected.buffer(.10) if protected is not None else None
    for a,b in pairs:
        pairs_to_remove={(a,b)}
        if mirror_x is not None:
            targets=[]
            for r in [a,b]:
                reflected=affinity.scale(ps[r],-1,1,origin=(mirror_x,0))
                targets.append(max(range(len(ps)),key=lambda j:reflected.intersection(ps[j]).area))
            pair=tuple(sorted(targets))
            if pair[0]!=pair[1]:pairs_to_remove.add(pair)
        lines=[];deleted=[]
        for e in m['edges']:
            line=LineString([e[:2],e[2:4]])
            (deleted if tuple(sorted(e[4:])) in pairs_to_remove else lines).append(line)
        edge=unary_union(deleted)
        if immutable is not None and edge.intersection(immutable).length>.015:continue
        protected_fraction=edge.intersection(zone).length/max(edge.length,.001) if zone is not None else 0
        # A closed eye/window with only one neighbour is a meaningful accent,
        # not a disposable tiny background pane.
        if any(len(m['adj'][r])==1 and ps[r].area<3 and protected_fraction>.8 for r in [a,b]):continue
        try:
            cm=from_lines(outline,lines,m['cols'],m['rows'],merge=False).to_map()
            if not preserves_boundary(cm,immutable):continue
            if cm['count']>=m['count'] or cm['count']<minimum_count:continue
            cm,preference=renumber_variable(cm,m,solution)
            if complexity(cm)>=base or inspect(cm):continue
            # Prefer removing short background partitions, not motif silhouettes.
            score=protected_fraction*1000+edge.length+min(ps[a].area,ps[b].area)*.2
            options.append((score,cm,preference,dict(point=p,method='remove dispensable divider',removedPairs=sorted(pairs_to_remove),protectedFraction=protected_fraction)))
        except (ValueError,AssertionError,RuntimeError,shapely.errors.GEOSException):continue
    return min(options,key=lambda o:o[0])[1:] if options else None


def finish_map(m,protected=None,mirror_x=None,minimum_count=12,immutable=None):
    """Production geometry-only entry point; does not assign puzzle colours."""
    identity=list(range(m['count']))
    m,history=repair(m,identity,protected,mirror_x,passes=3,immutable=immutable)
    for _ in range(40):
        if not junctions(m):break
        changed=False
        for p,_ in junctions(m):
            if not any(q==p for q,_ in junctions(m)):continue
            result=remove_divider(m,identity,p,protected,mirror_x,minimum_count,immutable)
            if result:
                m,identity,detail=result;history.append(detail);changed=True
                m,more=repair(m,identity,protected,mirror_x,passes=2,immutable=immutable);history.extend(more)
        if not changed:break
    return m,history
