import './brand.css'

export function BrandWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-wordmark ${className}`} role="img" aria-label="Terminal8">
      <span className="brand-name" aria-hidden="true">terminal</span>
      <span className="brand-eight" aria-hidden="true"><span>8</span></span>
    </span>
  )
}
