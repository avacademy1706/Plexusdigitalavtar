import { APP_CONFIG } from "../../config/environment";

const LOGO_URL = `${import.meta.env.BASE_URL}logo/plexus-logo.png`;

/** Official Plexus Digitals logo (public/logo/plexus-logo.png). Shown on a light tile so it reads on the dark UI. */
export function Logo({ className = "", size = 52 }: { className?: string; size?: number }) {
  return (
    <img
      src={LOGO_URL}
      width={size}
      height={size}
      alt={APP_CONFIG.companyName}
      decoding="async"
      className={`rounded-xl bg-[#f7f7f7] object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
