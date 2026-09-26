/** Add a launcher to the navigation shared by Chat, Combat, Actors, etc.
 * It is a button, not a tab: clicking it must not change the active sidebar tab.
 * No Settings visibility or GM permissions are involved.
 */
export function installSidebarLauncher(root,open){
  if(!root?.querySelector)return;
  const nav=root.querySelector('#sidebar-tabs')||root.querySelector('nav.tabs');
  if(!nav||nav.querySelector('.gn-sidebar-button'))return;
  const doc=nav.ownerDocument;
  const button=doc.createElement('button');
  button.type='button';
  button.className='ui-control icon gn-sidebar-button';
  button.title='Open Goodneighbor Slots';
  button.setAttribute('aria-label','Open Goodneighbor Slots');
  button.setAttribute('data-tooltip','Open Goodneighbor Slots');
  button.innerHTML='<i class="fa-solid fa-coins" aria-hidden="true"></i>';
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();open();});
  // Some Foundry/sidebar layouts wrap each navigation control in a list item.
  const chat=nav.querySelector('[data-tab="chat"]');
  const listItem=chat?.closest('li');
  if(listItem?.parentElement===nav||nav.tagName==='MENU'||nav.tagName==='UL'){
    const item=doc.createElement('li');item.className='gn-sidebar-nav-item';item.append(button);nav.append(item);
  }else nav.append(button);
}
