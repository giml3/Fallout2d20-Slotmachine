/** Add a launcher to the navigation shared by Chat, Combat, Actors, etc.
 * It is a button, not a tab: clicking it must not change the active sidebar tab.
 * No Settings visibility or GM permissions are involved.
 */
export function installSidebarLauncher(root,open){
  if(!root?.querySelector)return;
  const nav=root.querySelector('#sidebar-tabs')||root.querySelector('nav.tabs');
  if(!nav)return;
  const chat=nav.querySelector('[data-tab="chat"]');
  if(!chat)return;
  // v14 nests its vertical tab controls inside the outer navigation. Use the
  // actual Chat control's siblings, not the outer (horizontal) container.
  const listItem=chat.closest('li');
  const reference=listItem&&nav.contains(listItem)?listItem:chat;
  const container=reference.parentElement;
  if(nav.querySelector('.gn-sidebar-button'))return;
  const doc=nav.ownerDocument;
  const button=doc.createElement('button');
  button.type='button';
  button.className='ui-control plain icon gn-sidebar-button';
  button.title='Open Goodneighbor Slots';
  button.setAttribute('aria-label','Open Goodneighbor Slots');
  button.setAttribute('data-tooltip','Open Goodneighbor Slots');
  button.innerHTML='<i class="fa-solid fa-coins" aria-hidden="true"></i>';
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();open();});
  const collapse=container.querySelector('[data-action="toggleState"]');
  const end=collapse?.closest('li')||collapse;
  const before=end?.parentElement===container?end:null;
  if(reference.tagName==='LI'){
    const item=doc.createElement('li');item.className='gn-sidebar-nav-item';item.append(button);container.insertBefore(item,before);
  }else container.insertBefore(button,before);
}
