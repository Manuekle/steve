import { cn } from "@/lib/utils";

/**
 * The steve glyph on its own — no tile, no background, just the path in
 * `currentColor`, the way the landing header carries it. `app/icon.svg` is a
 * different asset on purpose: the favicon needs a near-black tile to survive
 * 16px against a browser chrome of unknown colour, and that tile is exactly
 * what looks wrong anywhere inside the app.
 */
export function SteveMark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 1006 1182"
      aria-hidden="true"
      className={cn("h-5 w-[17px] shrink-0 text-foreground", className)}
      fill="currentColor"
    >
      <g transform="matrix(1,0,0,1,-156.988047,-11.194657)">
        <g transform="matrix(1.423498,0,0,1.423498,-106.904993,-85.334406)">
          <path d="M525.497,729.029C551.929,728.466 628.385,728.55 697.277,681.174C783.329,621.996 752.893,552.599 708.348,534.879C657.182,514.526 605.373,551.189 593.233,559.084C525.302,603.258 477.592,672.171 424.467,651.584C399.911,642.068 360.241,617.62 361.771,521.503C361.949,510.349 362.87,452.443 381.24,383.432C407.811,283.611 457.027,136.041 565.414,86.315C657.899,43.884 704.56,87.017 710.87,92.011C745.475,119.404 750.993,168.528 742.219,201.423C716.501,297.84 597.929,369.573 544.173,410.073C503.026,441.072 440.952,481.708 423.706,528.574C409.989,565.848 432.041,591.252 458.439,586.188C504.23,577.406 526.85,506.882 590.911,451.99C685.607,370.849 840.865,380.034 883.191,505.611C933.836,655.869 738.523,781.253 737.713,781.81C573.818,894.481 399.448,898.577 381.508,898.065C236.594,893.931 231.662,792.882 308.585,752.665C385.754,712.321 457.709,729.109 525.497,729.029Z" />
          <path d="M186.092,685.563C177.924,615.075 242.392,554.54 274.587,545.815C337.614,528.734 358.046,611.026 310.984,679.838C271.236,737.955 200.687,756.319 186.092,685.563Z" />
        </g>
      </g>
    </svg>
  );
}
