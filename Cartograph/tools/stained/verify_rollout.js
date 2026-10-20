// Production publication audit against the pre-repair catalogue snapshot.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),vm=require('vm');
const E=require('../../engine.js'),root=path.resolve(__dirname,'../..'),out=path.join(root,'output/geometry-rollout');
function readCatalog(file){const context={window:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),context);return JSON.parse(JSON.stringify(context.window));}
const before=readCatalog(path.join(out,'before/stained-levels.js')),after=readCatalog(path.join(root,'stained-levels.js'));
const old=before.CARTO_STAINED,levels=after.CARTO_STAINED;
assert.deepEqual(levels.map(l=>l.id),old.map(l=>l.id),'play order changed');
assert.deepEqual(after.CARTO_STAINED_ORDER,before.CARTO_STAINED_ORDER,'save migration changed');
assert.deepEqual(levels[0],old[0],'cat lesson changed');
assert.deepEqual(levels.at(-1),old.at(-1),'retained brain changed');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const source=JSON.parse(fs.readFileSync(path.join(out,'before/manifest.json')));let transferred=0,panes=0;
const details=[];
for(let i=0;i<levels.length;i++){
 const l=levels[i],info=JSON.parse(fs.readFileSync(path.join(__dirname,'maps',l.id+'.json'))),art=JSON.parse(fs.readFileSync(path.join(root,info.artMetadata)));
 assert.equal(hash(path.join(root,source[i].image)),source[i].sha256,`${l.id}: original artwork overwritten`);
 assert(!info.artworkNeedsRefresh&&info.geometryQuality.version===2&&info.geometryQuality.valid);
 assert.equal(art.sha256,hash(path.join(root,l.image)));
 assert.equal(art.guide,hash(path.join(__dirname,'guides',l.id+'.png')));
 assert(art.paneColorCheck.valid&&art.paneColorCheck.total===l.map.count&&art.paneColorCheck.matched===l.map.count);
 assert.deepEqual(l.solution,info.solution);assert.equal(l.map.count,info.map.count);
 const hard=l.difficulty?.tier==='hard',starts=E.openings(l.map.adj,l.given,4),blank=l.given.filter(c=>c<0).length,logic=E.logicSolve(l.map.adj,l.given,4,hard);
 assert.equal(hard,(i+1)%10===0);assert(starts>=(hard||i===0?2:3));assert(logic.solved);assert.equal(E.countSolutions(l.map.adj,l.given,4,2).count,1);
 if(hard)assert(!E.propagationSolves(l.map.adj,l.given,4)&&logic.stats.pairs+logic.stats.probes>=3);
 else assert(E.propagationSolves(l.map.adj,l.given,4));
 if(l.canvasSize==='large')assert(l.map.count>=60&&blank>=35&&l.map.cols>=27&&l.map.rows>=36);
 if(l.image.endsWith('-restored.webp')){transferred++;panes+=l.map.count;assert.equal(art.sourceSha256,source[i].sha256);}
 details.push({level:i+1,id:l.id,panes:l.map.count,startingMoves:starts,toPaint:blank,hard,large:l.canvasSize==='large',advanced:logic.stats.pairs+logic.stats.probes});
}
const large=details.filter(d=>d.large),report={levels:levels.length,transferred,retained:levels.filter(l=>!l.image.endsWith('-restored.webp')).map(l=>l.id),matchedTransferredPanes:panes,hard:details.filter(d=>d.hard).length,large:large.length,largePanes:[Math.min(...large.map(d=>d.panes)),Math.max(...large.map(d=>d.panes))],largeToPaint:[Math.min(...large.map(d=>d.toPaint)),Math.max(...large.map(d=>d.toPaint))],orderPreserved:true,tutorialPreserved:true,sourceImagesPreserved:true,allUniqueAndLogical:true,details};
fs.writeFileSync(path.join(out,'final-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,details:undefined},null,2));
