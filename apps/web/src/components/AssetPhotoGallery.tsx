import { useCallback, useEffect, useRef, useState } from "react";
import AppIcon from "./AppIcon";
import { supabase } from "../lib/supabase";
import type { AssetPhotoRecord } from "../types/assets";
import { compressImage } from "../utils/imageCompression";

type Props = {
  organizationId: string;
  assetId: string;
};

export default function AssetPhotoGallery({
  organizationId,
  assetId,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<AssetPhotoRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadPhotos = useCallback(async () => {
    setIsLoading(true);

    const { data, error } = await supabase
      .from("asset_photos")
      .select(
        "id,organization_id,asset_id,storage_path,original_filename,mime_type,size_bytes,caption,is_primary,created_at",
      )
      .eq("organization_id", organizationId)
      .eq("asset_id", assetId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setFeedback({ type: "error", text: error.message });
      setIsLoading(false);
      return;
    }

    const signedPhotos = await Promise.all(
      ((data ?? []) as AssetPhotoRecord[]).map(async (photo) => {
        const { data: signedData, error: signedError } = await supabase.storage
          .from("asset-photos")
          .createSignedUrl(photo.storage_path, 3600);

        if (signedError) {
          return photo;
        }

        return {
          ...photo,
          signed_url: signedData.signedUrl,
        };
      }),
    );

    setPhotos(signedPhotos);
    setIsLoading(false);
  }, [assetId, organizationId]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  const handleFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setFeedback(null);
    setIsUploading(true);

    try {
      const compressed = await compressImage(file);
      const fileName = `${crypto.randomUUID()}.jpg`;
      const storagePath = `${organizationId}/${assetId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("asset-photos")
        .upload(storagePath, compressed, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { error: insertError } = await supabase
        .from("asset_photos")
        .insert({
          organization_id: organizationId,
          asset_id: assetId,
          storage_path: storagePath,
          original_filename: file.name,
          mime_type: "image/jpeg",
          size_bytes: compressed.size,
          is_primary: photos.length === 0,
        });

      if (insertError) {
        await supabase.storage.from("asset-photos").remove([storagePath]);
        throw insertError;
      }

      setFeedback({
        type: "success",
        text: "Foto compactada e adicionada ao equipamento.",
      });
      await loadPhotos();
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível enviar a foto.",
      });
    } finally {
      setIsUploading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const setPrimary = async (photoId: string) => {
    setFeedback(null);

    const { error: resetError } = await supabase
      .from("asset_photos")
      .update({ is_primary: false })
      .eq("organization_id", organizationId)
      .eq("asset_id", assetId);

    if (resetError) {
      setFeedback({ type: "error", text: resetError.message });
      return;
    }

    const { error } = await supabase
      .from("asset_photos")
      .update({ is_primary: true })
      .eq("organization_id", organizationId)
      .eq("asset_id", assetId)
      .eq("id", photoId);

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setFeedback({ type: "success", text: "Foto principal atualizada." });
    await loadPhotos();
  };

  const removePhoto = async (photo: AssetPhotoRecord) => {
    const confirmed = window.confirm(
      "Deseja remover esta foto do equipamento?",
    );

    if (!confirmed) {
      return;
    }

    setFeedback(null);

    const { error: storageError } = await supabase.storage
      .from("asset-photos")
      .remove([photo.storage_path]);

    if (storageError) {
      setFeedback({ type: "error", text: storageError.message });
      return;
    }

    const { error } = await supabase
      .from("asset_photos")
      .delete()
      .eq("organization_id", organizationId)
      .eq("asset_id", assetId)
      .eq("id", photo.id);

    if (error) {
      setFeedback({ type: "error", text: error.message });
      return;
    }

    setFeedback({ type: "success", text: "Foto removida." });
    await loadPhotos();
  };

  return (
    <section className="ativelo-photo-section">
      <div className="ativelo-detail-section-heading">
        <div>
          <span>REGISTRO VISUAL</span>
          <h3>Fotos do equipamento</h3>
        </div>

        <button
          type="button"
          className="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          <AppIcon name="camera" size={18} />
          {isUploading ? "Enviando..." : "Adicionar foto"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          hidden
          onChange={(event) =>
            void handleFile(event.target.files?.[0])
          }
        />
      </div>

      {feedback && (
        <div className={`ativelo-assets-feedback ${feedback.type}`}>
          {feedback.text}
        </div>
      )}

      {isLoading ? (
        <div className="ativelo-inline-empty">Carregando fotos...</div>
      ) : photos.length === 0 ? (
        <div className="ativelo-inline-empty">
          <AppIcon name="image" size={30} />
          <strong>Nenhuma foto cadastrada</strong>
          <span>
            Use a câmera do celular ou selecione uma imagem do computador.
          </span>
        </div>
      ) : (
        <div className="ativelo-photo-grid">
          {photos.map((photo) => (
            <article
              className={photo.is_primary ? "primary" : ""}
              key={photo.id}
            >
              {photo.signed_url ? (
                <img
                  src={photo.signed_url}
                  alt={photo.caption || "Foto do equipamento"}
                />
              ) : (
                <div className="ativelo-photo-unavailable">
                  Imagem indisponível
                </div>
              )}

              {photo.is_primary && (
                <span className="ativelo-primary-photo-badge">
                  <AppIcon name="star" size={13} />
                  Principal
                </span>
              )}

              <div className="ativelo-photo-actions">
                {!photo.is_primary && (
                  <button
                    type="button"
                    onClick={() => void setPrimary(photo.id)}
                    title="Definir como foto principal"
                  >
                    <AppIcon name="star" size={17} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void removePhoto(photo)}
                  title="Remover foto"
                >
                  <AppIcon name="trash" size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
