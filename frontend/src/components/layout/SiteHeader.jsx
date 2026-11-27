import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ScanLine, SlidersHorizontal, Moon, Sun } from 'lucide-react';
import { BrandLogo, Button, IconButton } from '../common';
import { usePreferences } from '../../context/PreferencesContext';
export function SiteHeader({onOpenSettings=null,extraNav=null}) {
 const {pathname}=useLocation();
 const headerRef=useRef(null);
 useEffect(()=>{
  const sentinel=document.getElementById('mb-scroll-origin');
  if(!sentinel || !window.IntersectionObserver)return;
  const observer=new IntersectionObserver(([entry])=>{
   if(headerRef.current) headerRef.current.dataset.scrolled=String(!entry.isIntersecting);
  });
  observer.observe(sentinel);return ()=>observer.disconnect();
 },[]);
 const {preferences,updatePreferences}=usePreferences();
 return <header ref={headerRef} className="mb-chrome-header mb-header">
  <div className="mb-shell-container mb-header-inner"><Link to="/" className="mb-brand-link" aria-label="MindBridge home"><BrandLogo /></Link>
   {pathname==='/'?<nav className="mb-home-nav" aria-label="Explore MindBridge"><a href="#how-it-works">How it works</a><a href="#learning">Learning, rethought</a></nav>:<span className="mb-workspace-label">{pathname==='/scan'?'Capture your page':pathname.startsWith('/learn')?'Understanding practice':'Reading workspace'}</span>}
   <nav aria-label="Primary" className="mb-header-actions">{extraNav}
    {!onOpenSettings?<IconButton variant="quiet" icon={preferences.theme==='dark'?Sun:Moon} label={preferences.theme==='dark'?'Use light theme':'Use dark theme'} onClick={()=>updatePreferences({theme:preferences.theme==='dark'?'cream':'dark'})}/>:null}
    {pathname!=='/scan'?<Link to="/scan" className="mb-nav-scan mb-button"><ScanLine size={17} aria-hidden="true" /><span>Scan page</span></Link>:null}
    {onOpenSettings?<Button className="mb-header-settings" aria-label="Reading settings" variant="secondary" size="sm" icon={SlidersHorizontal} onClick={onOpenSettings}>Reading settings</Button>:null}
   </nav>
  </div>
 </header>;
}
