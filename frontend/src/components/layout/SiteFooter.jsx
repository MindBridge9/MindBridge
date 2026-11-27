import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { BrandLogo } from '../common';
export function SiteFooter() {
  return <footer className="mb-chrome-footer mb-editorial-footer">
    <div className="mb-shell-container">
      <div><BrandLogo size={28} /><p>Every page understood.<br />Not just read.</p></div>
      <div><p>A textbook companion, built around understanding.</p><span>Team WHACKERS · wHACKiest 2026</span><span>English printed textbook pages.</span></div>
      <Link to="/scan">Start with a page <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </div>
  </footer>;
}
