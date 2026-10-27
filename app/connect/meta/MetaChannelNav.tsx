import ProviderIcon from "../../ProviderIcon";

export default function MetaChannelNav({ active, brandId }: { active?: string; brandId?: string }) {
  return <nav className="meta-channel-nav" aria-label="Meta channel setup">
    {[ ["facebook", "Facebook"], ["instagram", "Instagram"], ["whatsapp", "WhatsApp Business"] ].map(([provider, name]) => <a
      key={provider} href={`/connect/meta?provider=${provider}${brandId ? `&brand=${encodeURIComponent(brandId)}` : ""}`}
      aria-current={active === provider ? "page" : undefined}>
      <ProviderIcon provider={provider} size={23}/><span>{name}</span>
    </a>)}
  </nav>;
}
