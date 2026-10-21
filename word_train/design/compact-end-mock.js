// Review-only transformation of the existing result DOM. No gameplay files changed.
export async function compactEndMock() {
  const root=document.querySelector('.wt-levelend');
  const body=root.querySelector('.wt-levelend__body');
  const sign=root.querySelector('.wt-levelend__station-sign');
  const train=document.querySelector('.wt-train');
  const card=document.createElement('article');card.className='compact-card';
  const dock=document.createElement('div');dock.className='compact-dock';
  dock.append(train,sign);card.append(dock,body);root.append(card);
  const stats=root.querySelector('.wt-levelend__stats');stats.removeAttribute('aria-hidden');
  const first=stats.firstElementChild,value=first.querySelector('strong').textContent;
  const receipt=root.querySelector('.wt-levelend__receipt');receipt.hidden=true;
  receipt.id='compact-receipt';
  const toggle=document.createElement('button');toggle.className='compact-toggle';toggle.type='button';
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',receipt.id);
  toggle.setAttribute('aria-label',`${value} bağlantı; son bağlantıları göster`);
  toggle.innerHTML=`${value} bağlantı <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>`;
  toggle.addEventListener('click',()=>{const open=receipt.hidden;receipt.hidden=!open;toggle.setAttribute('aria-expanded',String(open));});
  first.replaceChildren(toggle);
  root.querySelector('.wt-levelend__all-complete').textContent='Tüm bölümleri tamamladın.';
  await new Promise(r=>setTimeout(r,180));
  return {card:card.getBoundingClientRect().toJSON(),dock:dock.getBoundingClientRect().toJSON()};
}
