import { version } from "../package.json";

export default function VersionBadge() {
  return <span className="version-badge" title={`SenderDeck version ${version}`}>{`v${version}`}</span>;
}
