"use client";
import React, { Suspense } from "react";
import FileBrowserClient from "@/components/FileBroswerClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <FileBrowserClient />
    </Suspense>
  );
}
