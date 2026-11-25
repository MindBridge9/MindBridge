export function EmptyState({
  icon: Icon = null,
  title,
  description,
  actions = null,
  className = '',
}) {
  return (
    <div
      className={`rounded-[12px] border border-[#C9D2C8] bg-white p-6 text-center flex flex-col items-center gap-3 ${className}`}
    >
      {Icon ? (
        <div className="w-11 h-11 rounded-[6px] bg-[#DCE9DF] text-[#204C43] flex items-center justify-center">
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
      ) : null}
      <h2 className="text-[18px] font-bold m-0 text-[#20372D]">{title}</h2>
      {description ? (
        <p className="text-[15px] text-[#3F584D] max-w-[46ch] m-0">{description}</p>
      ) : null}
      {actions ? <div className="flex flex-wrap justify-center gap-3 mt-1">{actions}</div> : null}
    </div>
  );
}
