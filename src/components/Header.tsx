import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-zinc-800">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight flex items-center gap-3">
          Video Studio Pro
        </h1>
      </div>
    </header>
  );
};

export default Header;
