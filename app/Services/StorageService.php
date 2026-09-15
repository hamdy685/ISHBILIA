<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class StorageService
{
    /**
     * Determine the active storage disk (prefers Cloudflare R2 if configured).
     */
    public static function disk(): string
    {
        if (config('filesystems.default') === 'r2' || config('filesystems.default') === 's3') {
            return config('filesystems.default');
        }

        if (config('filesystems.disks.r2.key') && config('filesystems.disks.r2.bucket')) {
            return 'r2';
        }

        if (config('filesystems.disks.s3.key') && config('filesystems.disks.s3.bucket')) {
            return 's3';
        }

        return 'public';
    }

    /**
     * Store an uploaded file to the active disk.
     */
    public static function storeUploadedFile(UploadedFile $file, string $directory = 'attachments'): array
    {
        $disk = self::disk();
        $extension = $file->getClientOriginalExtension() ?: 'bin';
        $fileName = Str::slug(pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME)) . '_' . time() . '_' . Str::random(6) . '.' . $extension;
        
        $path = $file->storeAs($directory, $fileName, $disk);

        return [
            'disk' => $disk,
            'path' => $path,
            'name' => $file->getClientOriginalName(),
            'size' => $file->getSize(),
            'mime_type' => $file->getClientMimeType() ?: $file->getMimeType(),
            'url' => self::url($path, $disk),
        ];
    }

    /**
     * Store base64 data to the active disk.
     */
    public static function storeBase64(string $base64Data, string $directory = 'receipts', ?string $customName = null): ?array
    {
        $extension = 'jpg';
        $mimeType = 'image/jpeg';
        $data = $base64Data;

        if (str_contains($base64Data, ';base64,')) {
            $parts = explode(';base64,', $base64Data, 2);
            $meta = $parts[0];
            $data = $parts[1] ?? '';

            if (preg_match('/data:image\/([a-zA-Z0-9\+\-]+)/i', $meta, $matches)) {
                $ext = strtolower($matches[1]);
                if ($ext === 'jpeg' || $ext === 'pjpeg') {
                    $extension = 'jpg';
                    $mimeType = 'image/jpeg';
                } elseif ($ext === 'png') {
                    $extension = 'png';
                    $mimeType = 'image/png';
                } elseif ($ext === 'webp') {
                    $extension = 'webp';
                    $mimeType = 'image/webp';
                } else {
                    $extension = $ext;
                    $mimeType = 'image/' . $ext;
                }
            }
        }

        $decoded = base64_decode($data);
        if ($decoded === false || empty($decoded)) {
            return null;
        }

        $disk = self::disk();
        $fileName = 'receipt_' . time() . '_' . Str::random(8) . '.' . $extension;
        $path = rtrim($directory, '/') . '/' . $fileName;

        Storage::disk($disk)->put($path, $decoded);

        return [
            'disk' => $disk,
            'path' => $path,
            'name' => $customName ?: $fileName,
            'size' => strlen($decoded),
            'mime_type' => $mimeType,
            'url' => self::url($path, $disk),
        ];
    }

    /**
     * Get the public URL for a stored file.
     */
    public static function url(?string $path, ?string $disk = null): ?string
    {
        if (! $path) {
            return null;
        }

        if (filter_var($path, FILTER_VALIDATE_URL)) {
            return $path;
        }

        $disk = $disk ?: self::disk();

        if ($disk === 'r2' || $disk === 's3') {
            $r2PublicUrl = config('filesystems.disks.r2.url') ?: config('filesystems.disks.s3.url');
            if ($r2PublicUrl) {
                return rtrim($r2PublicUrl, '/') . '/' . ltrim($path, '/');
            }
            try {
                return Storage::disk($disk)->url($path);
            } catch (\Throwable) {
                // fallback to local API streaming route if URL generation fails
            }
        }

        return null;
    }

    /**
     * Stream or download a file from any configured disk (R2, S3, Public, Local).
     */
    public static function streamResponse(
        string $path,
        ?string $fileName = null,
        ?string $mimeType = null,
        bool $download = false
    ): Response {
        $fileName = $fileName ?: basename($path);
        $mimeType = $mimeType ?: 'application/octet-stream';
        $disksToCheck = ['r2', 's3', 'public', 'local'];

        foreach ($disksToCheck as $disk) {
            try {
                if (Storage::disk($disk)->exists($path)) {
                    // For R2 / S3, if public URL is configured and we're inline viewing, we can redirect or stream
                    if (($disk === 'r2' || $disk === 's3') && ! $download) {
                        $publicUrl = config('filesystems.disks.r2.url') ?: config('filesystems.disks.s3.url');
                        if ($publicUrl) {
                            return redirect()->away(rtrim($publicUrl, '/') . '/' . ltrim($path, '/'));
                        }
                    }

                    if ($download) {
                        return Storage::disk($disk)->download($path, $fileName, [
                            'Content-Type' => $mimeType,
                        ]);
                    }

                    return Storage::disk($disk)->response($path, $fileName, [
                        'Content-Type' => $mimeType,
                        'Content-Disposition' => 'inline; filename="' . $fileName . '"',
                    ]);
                }
            } catch (\Throwable) {
                continue;
            }
        }

        // Fallback checks in local filesystem paths
        $baseName = basename($path);
        $fileBaseName = basename($fileName);
        $localPaths = [
            storage_path('app/public/' . $path),
            storage_path('app/private/' . $path),
            storage_path('app/' . $path),
            public_path('storage/' . $path),
            public_path($path),
            public_path('demo-assets/quotes/' . $baseName),
            public_path('demo-assets/quotes/' . $fileBaseName),
            public_path('storage/quotes/' . $baseName),
            public_path('storage/quotes/' . $fileBaseName),
            storage_path('app/public/quotes/' . $baseName),
            storage_path('app/public/quotes/' . $fileBaseName),
            base_path($path),
            base_path($baseName),
            base_path($fileBaseName),
        ];

        foreach ($localPaths as $localPath) {
            if (file_exists($localPath) && ! is_dir($localPath)) {
                $resolvedMime = $mimeType;
                if (! $resolvedMime || $resolvedMime === 'application/octet-stream') {
                    $ext = strtolower(pathinfo($localPath, PATHINFO_EXTENSION));
                    $resolvedMime = match ($ext) {
                        'png' => 'image/png',
                        'jpg', 'jpeg' => 'image/jpeg',
                        'webp' => 'image/webp',
                        'gif' => 'image/gif',
                        'pdf' => 'application/pdf',
                        'html', 'htm' => 'text/html',
                        default => 'application/pdf',
                    };
                }
                return response()->file($localPath, [
                    'Content-Type' => $resolvedMime,
                    'Content-Disposition' => ($download ? 'attachment' : 'inline') . '; filename="' . $fileName . '"',
                ]);
            }
        }

        abort(404, 'الملف المطلوب غير موجود على الخادم أو التخزين السحابي.');
    }

    /**
     * Delete a file from all storage disks.
     */
    public static function delete(?string $path, ?string $disk = null): bool
    {
        if (! $path) {
            return false;
        }

        $deleted = false;
        $disks = $disk ? [$disk] : ['r2', 's3', 'public', 'local'];

        foreach ($disks as $d) {
            try {
                if (Storage::disk($d)->exists($path)) {
                    Storage::disk($d)->delete($path);
                    $deleted = true;
                }
            } catch (\Throwable) {
                continue;
            }
        }

        return $deleted;
    }
}
