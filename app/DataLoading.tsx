export default function DataLoading({label="Loading information…",compact=false}:{label?:string;compact?:boolean}) {
 return <div className={`data-loading${compact?" is-compact":""}`} role="status" aria-live="polite">
  <div className="data-loading-label"><span className="data-loading-spinner" aria-hidden="true"/><span>{label}</span></div>
  {!compact&&<div className="data-loading-rows" aria-hidden="true">{[0,1,2,3].map(row=><div className="data-loading-row" key={row}><span/><span/><span/></div>)}</div>}
 </div>;
}
