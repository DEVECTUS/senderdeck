const marks: Record<string, string> = {
  google: "google.png", microsoft: "microsoft.svg", openai: "openai.svg",
  facebook: "facebook.svg", instagram: "instagram.svg", meta: "meta.svg", linkedin: "linkedin.svg",
};

/** Decorative provider mark: the adjacent provider/account name is the label. */
export default function ProviderIcon({ provider, size = 22 }: { provider: string; size?: number }) {
  const mark = marks[provider.toLowerCase()];
  return mark ? <img className="provider-icon" src={`/providers/${mark}`} width={size} height={size} alt="" aria-hidden="true" /> : null;
}
