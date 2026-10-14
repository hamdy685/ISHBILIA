<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class GoogleDriveService
{
    public static function isConfigured(): bool
    {
        $clientId = self::clientId();
        $clientSecret = self::clientSecret();
        $refreshToken = self::refreshToken();
        $folderId = self::folderId();

        return ! empty($clientId) && ! empty($clientSecret) && ! empty($refreshToken) && ! empty($folderId);
    }

    public static function clientId(): string
    {
        return (string) config('google_drive.client_id', env('GOOGLE_DRIVE_CLIENT_ID', ''));
    }

    public static function clientSecret(): string
    {
        return (string) config('google_drive.client_secret', env('GOOGLE_DRIVE_CLIENT_SECRET', ''));
    }

    public static function refreshToken(): string
    {
        return (string) config('google_drive.refresh_token', env('GOOGLE_DRIVE_REFRESH_TOKEN', ''));
    }

    public static function folderId(): string
    {
        return (string) config('google_drive.folder_id', env('GOOGLE_DRIVE_RECEIPTS_FOLDER_ID', env('GOOGLE_DRIVE_FOLDER_ID', '1ZdrP3K-NqU4uIs5GL3JD7biz7rDpSIdX')));
    }

    /**
     * Get a valid access token using the refresh token, with caching.
     */
    public static function getAccessToken(): ?string
    {
        if (! self::isConfigured()) {
            return null;
        }

        return Cache::remember('google_drive_access_token', 3000, function () {
            try {
                $response = Http::asForm()->timeout(15)->post('https://oauth2.googleapis.com/token', [
                    'client_id' => self::clientId(),
                    'client_secret' => self::clientSecret(),
                    'refresh_token' => self::refreshToken(),
                    'grant_type' => 'refresh_token',
                ]);

                if (! $response->successful()) {
                    Log::error('Google Drive OAuth token refresh failed', ['status' => $response->status(), 'body' => $response->body()]);
                    return null;
                }

                $json = $response->json();
                return $json['access_token'] ?? null;
            } catch (Throwable $e) {
                Log::error('Google Drive token exception: ' . $e->getMessage());
                return null;
            }
        });
    }

    /**
     * Upload binary content to Google Drive inside the receipts folder.
     */
    public static function upload(string $binaryContent, string $fileName, string $mimeType = 'image/jpeg', ?string $customFolderId = null): ?array
    {
        $accessToken = self::getAccessToken();
        if (! $accessToken) {
            Log::warning('Google Drive upload aborted: No valid access token.');
            return null;
        }

        $folderId = $customFolderId ?: self::folderId();
        $boundary = 'ishbilia_boundary_' . bin2hex(random_bytes(10));

        $metadata = json_encode([
            'name' => $fileName,
            'parents' => [$folderId],
            'mimeType' => $mimeType,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);

        $body = "--{$boundary}\r\n"
            . "Content-Type: application/json; charset=UTF-8\r\n\r\n"
            . $metadata . "\r\n"
            . "--{$boundary}\r\n"
            . "Content-Type: {$mimeType}\r\n\r\n"
            . $binaryContent . "\r\n"
            . "--{$boundary}--";

        try {
            $response = Http::withToken($accessToken)
                ->timeout(30)
                ->withHeaders([
                    'Content-Type' => "multipart/related; boundary={$boundary}",
                    'Content-Length' => strlen($body),
                ])
                ->withBody($body, "multipart/related; boundary={$boundary}")
                ->post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink,size');

            if (! $response->successful()) {
                Log::error('Google Drive upload failed', ['status' => $response->status(), 'body' => $response->body()]);
                return null;
            }

            $data = $response->json();
            $fileId = $data['id'] ?? null;

            if ($fileId) {
                // Ensure file is readable with the link
                self::makeFilePubliclyReadable($accessToken, $fileId);
            }

            $webViewLink = $data['webViewLink'] ?? "https://drive.google.com/file/d/{$fileId}/view";
            $webContentLink = $data['webContentLink'] ?? "https://drive.google.com/uc?id={$fileId}&export=download";

            Log::info("Google Drive upload successful for {$fileName}: {$webViewLink}");

            return [
                'disk' => 'google_drive',
                'id' => $fileId,
                'path' => $webViewLink,
                'url' => $webViewLink,
                'download_url' => $webContentLink,
                'name' => $fileName,
                'size' => strlen($binaryContent),
                'mime_type' => $mimeType,
            ];
        } catch (Throwable $e) {
            Log::error('Google Drive upload exception: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Grant 'reader' role to 'anyone' with link so receipt photos can be viewed seamlessly.
     */
    private static function makeFilePubliclyReadable(string $accessToken, string $fileId): void
    {
        try {
            Http::withToken($accessToken)
                ->timeout(10)
                ->post("https://www.googleapis.com/drive/v3/files/{$fileId}/permissions?supportsAllDrives=true", [
                    'role' => 'reader',
                    'type' => 'anyone',
                    'allowFileDiscovery' => false,
                ]);
        } catch (Throwable $e) {
            Log::warning("Could not set public permission on Google Drive file {$fileId}: " . $e->getMessage());
        }
    }
}
