"use client";

import React from 'react';

const SearchBar: React.FC<{ onSearch: (query: string) => void }> = ({ onSearch }) => {
  const [query, setQuery] = React.useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSearch(query);
    };

    return (
        <form onSubmit={handleSubmit} className="mb-5 w-3/4 mx-auto">
            <input
                type="text"
                value={query}
                onChange={(e) => {
                    const v = e.target.value;
                    setQuery(v);
                    onSearch(v);
                }}
                placeholder="Search"
                className="border border-neutral-500 rounded-md p-2 w-full placeholder:text-neutral-500 focus:outline-none focus:ring-0 focus:shadow-none focus:border-neutral-400 focus:bg-transparent transition-colors"
            />
        </form>
    );
};

export default SearchBar;