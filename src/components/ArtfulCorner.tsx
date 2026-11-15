import "./artful-corner.css";

/** Decorative-only pigment and botanical illustration; pointer events are disabled in its stylesheet. */
export default function ArtfulCorner({ className = "" }: { className?: string }) {
  return (
    <div className={`artful-corner ${className}`} aria-hidden="true">
      <svg viewBox="0 0 190 190" fill="none">
        <path d="M12 178C48 148 66 112 72 25M32 155c21-9 40-7 56 4M51 126c-3-21 4-38 24-51M67 92c18-2 34 5 45 22M73 66c-1-16 6-28 20-37M29 158c-8-18-7-34 4-48" stroke="#6F8068" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M32 154c-5-19 1-32 16-40 7 17 1 31-16 40ZM72 125c-2-20 6-33 24-39 4 18-5 31-24 39ZM71 92c14-15 29-17 44-7-9 17-24 20-44 7ZM73 63c-1-17 8-27 25-31 2 16-6 27-25 31Z" fill="#D8DFD0" fillOpacity=".85" stroke="#6F8068" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M133 35c3 10 10 16 20 19-10 3-17 9-20 20-3-11-10-17-20-20 10-3 17-9 20-19Z" fill="#D3914A" fillOpacity=".88" />
        <path d="M119 87c2 7 6 11 13 13-7 2-11 6-13 13-2-7-6-11-13-13 7-2 11-6 13-13Z" fill="#B56C61" fillOpacity=".75" />
        <circle cx="158" cy="89" r="4" fill="#D3914A" /><circle cx="145" cy="116" r="2.5" fill="#71806A" /><circle cx="167" cy="136" r="3" fill="#B56C61" />
        <path d="M101 164c19-12 40-16 70-9-17 18-43 23-70 9Z" fill="#E8CFA9" fillOpacity=".8" />
      </svg>
      <span className="artful-pigment artful-pigment-one" />
      <span className="artful-pigment artful-pigment-two" />
      <span className="artful-swash" />
    </div>
  );
}
