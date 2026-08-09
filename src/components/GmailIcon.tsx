import React from 'react';

export const GmailIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <div className="w-6 h-6 shrink-0 flex items-center justify-center p-0.5 overflow-visible">
    <svg
      className={`${className} shrink-0 overflow-visible object-contain`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {/* Blue - Left Pillar */}
      <path
        d="M 2 6.5 v 11 c 0 1.1 .9 2 2 2 h 2.5 v -8 L 2 7.5 Z"
        fill="#4285F4"
      />
      {/* Green - Right Pillar */}
      <path
        d="M 22 6.5 v 11 c 0 1.1 -.9 2 -2 2 h -2.5 v -8 L 22 7.5 Z"
        fill="#34A853"
      />
      {/* Red - Center Fold */}
      <path
        d="M 17.5 4.5 H 6.5 C 5.4 4.5 4.5 5.4 4.5 6.5 v 1 L 12 13.25 L 19.5 7.5 v -1 C 19.5 5.4 18.6 4.5 17.5 4.5 Z"
        fill="#EA4335"
      />
      {/* Yellow - Top Right Corner */}
      <path
        d="M 17.5 4.5 H 20 C 21.1 4.5 22 5.4 22 6.5 v 1 L 17.5 11 Z"
        fill="#FBBC04"
      />
      {/* Dark Red - Top Left Corner */}
      <path
        d="M 6.5 4.5 H 4 C 2.9 4.5 2 5.4 2 6.5 v 1 L 6.5 11 Z"
        fill="#C5221F"
      />
    </svg>
  </div>
);
