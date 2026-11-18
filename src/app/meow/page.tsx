import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import CatOracle from "@/components/cat-oracle";

export const metadata: Metadata = {
  title: "The Cat Oracle",
  description: "A very serious cat-powered fortune-telling machine.",
};

export default function MeowPage() {
  const filenames = readdirSync(join(process.cwd(), "public", "meow"))
    .filter((filename) => /^[MS].*\.png$/i.test(filename))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  if (filenames.length === 0) {
    throw new Error("The cat oracle needs at least one M or S PNG in public/meow.");
  }

  const images = filenames.map((filename) => {
    const name = filename.slice(0, -4);
    const isDuo = name.toUpperCase() === "S_M_1";
    const label = isDuo ? "The double act" : `${name[0]} cat #${name.slice(1)}`;

    return {
      src: `/meow/${filename}`,
      label,
      alt: isDuo ? "Two cats together" : `${name[0]} cat`,
    };
  });

  return <CatOracle images={images} />;
}
