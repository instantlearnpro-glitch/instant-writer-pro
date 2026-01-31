import React from 'react';

const Cloud: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: -1,
    }}
  >
    <path
      d="M 25 65 C 15 50, 20 30, 30 15 C 45 10, 60 12, 75 25 C 85 40, 80 60, 70 75 C 60 85, 45 88, 35 80 Z"
      fill="#e0f2f7"
      stroke="#a7d9ed"
      strokeWidth="1"
    />
  </svg>
);

export default Cloud;
