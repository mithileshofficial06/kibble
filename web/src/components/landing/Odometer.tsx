const DIGITS = "0123456789".split("");

/** A number that rolls digit by digit, like a mechanical counter. */
export function Odometer({ value, className }: { value: string; className?: string }) {
  return (
    <span className={`odo ${className ?? ""}`} aria-label={value} role="text">
      {[...value].map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="odo-d" aria-hidden="true">
            <span className="odo-strip" style={{ transform: `translateY(-${Number(ch) * 10}%)` }}>
              {DIGITS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} className="odo-c" aria-hidden="true">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
