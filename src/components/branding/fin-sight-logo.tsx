type FinSightLogoProps = {
  size?: number;
  strokeWidth?: number;
};

export function FinSightLogo({
  size = 14,
  strokeWidth = 1.75,
}: FinSightLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ color: "#fafafa" }}
    >
      <path
        d="M4 2.5V13.5M4 2.5H12M4 7.75H9.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
