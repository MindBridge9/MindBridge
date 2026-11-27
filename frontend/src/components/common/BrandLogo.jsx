export function BrandLogo({ size = 34, showWordmark = true, className = '' }) {
  return <span className={`mb-brand ${className}`}>
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="var(--mb-action)" />
      <path d="M8 11.5C12 10 15 11 18 14C21 11 24 10 28 11.5V25C24 23.5 21 24 18 27C15 24 12 23.5 8 25V11.5Z" stroke="white" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M18 14V27M12 16.5C14 16.5 15 17 16 18M20 18C21 17 22 16.5 24 16.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
    </svg>{showWordmark&&<span>MindBridge<span className="mb-brand-dot">.</span></span>}
  </span>;
}
