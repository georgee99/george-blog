"use client";

import Image from "next/image";
import { useState } from "react";

const fortunes = [
  "A tiny creature will soon demand your full attention.",
  "Today is a good day to knock something off a table.",
  "Your next nap will be excellent. The cat has spoken.",
  "A mysterious snack may appear in your future.",
  "Someone nearby is thinking about you. Probably because you have snacks.",
  "Trust your instincts. Unless they involve sitting on a keyboard.",
  "An unexpected sunbeam is headed your way.",
  "You are doing great. The cat has no notes.",
  "A cardboard box may soon become the most interesting place in the room.",
  "Today, someone will admire you from across the room and then immediately walk away.",
  "Your next idea will arrive exactly when you should be sleeping.",
  "You have the energy of a cat who just knocked over a glass.",
  "A new friendship may begin with a suspicious sniff.",
  "The perfect seat is the one someone else just got up from.",
  "A bold choice awaits you. Maybe try the new flavor.",
  "Your inbox can wait. This patch of sunlight cannot.",
  "The cat believes in you, but would also like you to open the door.",
  "You are someone's favorite person. Mostly because you feed them.",
  "An unexpected visitor may arrive. Act casual, it is just a pigeon.",
  "Your future is bright, and possibly covered in loose fur.",
  "A little curiosity could lead somewhere interesting. Or under the couch.",
  "You will soon be chosen as a perfectly adequate pillow.",
  "Confidence is just walking into a room like you own it.",
  "A mystery will be solved today. It was the cat all along.",
  "You may feel watched today. You are. The cat is judging your posture.",
  "A surprise awaits you around the corner. It may be a toy mouse.",
  "A quiet moment is on its way. Unless the zoomies start.",
  "Your next great adventure begins with getting up from the couch.",
  "Do not worry about being behind. The cat has never checked a calendar.",
  "Today calls for bold moves and a very gentle landing.",
  "A soft blanket and an open window could solve most of your problems.",
  "Good luck is near. It has whiskers and is pretending not to care.",
];

type CatImage = {
  src: string;
  label: string;
  alt: string;
};

export default function CatOracle({ images }: { images: CatImage[] }) {
  const [catIndex, setCatIndex] = useState(0);
  const [fortuneIndex, setFortuneIndex] = useState(0);
  const [drawCount, setDrawCount] = useState(0);
  const cat = images[catIndex];

  function drawAgain() {
    if (images.length > 1) {
      let nextIndex = Math.floor(Math.random() * (images.length - 1));
      if (nextIndex >= catIndex) nextIndex += 1;
      setCatIndex(nextIndex);
    }

    setFortuneIndex((current) => (current + 1 + Math.floor(Math.random() * (fortunes.length - 1))) % fortunes.length);
    setDrawCount((count) => count + 1);
  }

  return (
    <section className="mx-auto max-w-lg space-y-6 text-center">
      <header className="space-y-2">
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          You found the secret
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">The Cat Oracle</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Ask the cats, they know things
        </p>
      </header>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-white dark:bg-neutral-950">
          <Image
            key={cat.src}
            src={cat.src}
            alt={cat.alt}
            fill
            sizes="(max-width: 640px) 100vw, 384px"
            className="object-contain"
            unoptimized
            priority
          />
        </div>

        <p className="mt-4 text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {cat.label}
        </p>
        <p aria-live="polite" className="mt-3 min-h-12 text-lg leading-relaxed">
          “{fortunes[fortuneIndex]}”
        </p>

        <button
          type="button"
          onClick={drawAgain}
          className="mt-4 rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Draw another cat
        </button>
        <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-500">
          Oracle draws: {drawCount}
        </p>
      </div>
    </section>
  );
}
