"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addVehiclePhoto, deleteVehiclePhoto } from "../actions";

export interface Photo {
  id: string;
  url: string;
  is_cover: boolean;
}

export function PhotosUploader({
  dealerId,
  vehicleId,
  initialPhotos,
}: {
  dealerId: string | null;
  vehicleId: string;
  initialPhotos: Photo[];
}) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length || !dealerId) return;
    setError(null);
    setBusy(true);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${dealerId}/${vehicleId}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage
          .from("vehicle-photos")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) {
          setError("Upload failed.");
          continue;
        }
        const res = await addVehiclePhoto(vehicleId, path);
        if (res.error || !res.id) {
          setError(res.error ?? "Could not save the photo.");
          continue;
        }
        const { data } = await supabase.storage
          .from("vehicle-photos")
          .createSignedUrl(path, 3600);
        setPhotos((prev) => [
          ...prev,
          { id: res.id!, url: data?.signedUrl ?? "", is_cover: !!res.isCover },
        ]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    await deleteVehiclePhoto(id);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => (
          <div
            key={p.id}
            className="group relative aspect-video overflow-hidden rounded-lg border border-slate-800 bg-slate-900"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="h-full w-full object-cover" />
            {p.is_cover && (
              <span className="absolute left-1 top-1 rounded bg-sky-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                Cover
              </span>
            )}
            <button
              onClick={() => remove(p.id)}
              className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white opacity-0 hover:bg-red-500 group-hover:opacity-100"
            >
              Delete
            </button>
          </div>
        ))}

        {dealerId && (
          <label className="flex aspect-video cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-700 text-slate-400 hover:border-sky-500">
            <span className="text-sm">{busy ? "Uploading…" : "+ Add photos"}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => onFiles(e.target.files)}
            />
          </label>
        )}
      </div>

      {!dealerId && (
        <p className="mt-3 text-xs text-slate-500">
          Photo upload needs a connected Supabase project (disabled in demo mode).
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
