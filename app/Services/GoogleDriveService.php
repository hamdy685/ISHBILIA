<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class GoogleDriveService
{
    /**
     * Check if Google Drive credentials and folder are configured.
     */
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
        return (string) config('google_drive.folder_id', env('GOOGLE_DRIVE_FOLDER_ID', '1EB9h3hue3aPM_zlx_AbRBydPZP3nnPDU'));
    }

    public static function receiptsFolderId(): string
    {
        $configured = (string) config('google_drive.receipts_folder_id', env('GOOGLE_DRIVE_RECEIPTS_FOLDER_ID', ''));
        if (! empty($configured)) {
            return $configured;
        }

        // Auto-resolve or create "أذونات استلام إشبيليا" folder in Google Drive (or use existing alternative names)
        return (string) Cache::remember('google_drive_receipts_resolved_folder_id', 86400, function () {
            return self::getOrCreateFolder('أذونات استلام إشبيليا', self::folderId(), [
                'أذونات استلام اشبيليا',
                'اذونات استلام اشبيليا',
                'اذونات استلام إشبيليا',
                'أذونات الاستلام',
                'اذونات الاستلام',
                'Receipts',
            ]) ?: self::folderId();
        });
    }

    public static function invoicesFolderId(): string
    {
        $configured = (string) config('google_drive.invoices_folder_id', env('GOOGLE_DRIVE_INVOICES_FOLDER_ID', ''));
        if (! empty($configured)) {
            return $configured;
        }

        // Auto-resolve or create "فواتير" folder in Google Drive (or use existing "الفواتير")
        return (string) Cache::remember('google_drive_invoices_resolved_folder_id', 86400, function () {
            return self::getOrCreateFolder('فواتير', self::folderId(), ['الفواتير', 'Invoices']) ?: self::folderId();
        });
    }

    public static function quotesFolderId(): string
    {
        $configured = (string) config('google_drive.quotes_folder_id', env('GOOGLE_DRIVE_QUOTES_FOLDER_ID', ''));
        if (! empty($configured)) {
            return $configured;
        }

        // Auto-resolve or create "عروض أسعار" folder in Google Drive (or use existing "عروض الأسعار")
        return (string) Cache::remember('google_drive_quotes_resolved_folder_id', 86400, function () {
            return self::getOrCreateFolder('عروض أسعار', self::folderId(), ['عروض الأسعار', 'عروض اسعار', 'عروض الاسعار', 'Quotes', 'Price Quotes']) ?: self::folderId();
        });
    }

    /**
     * Search for a folder by name inside a parent, or create it if missing.
     */
    public static function getOrCreateFolder(string $folderName, ?string $parentFolderId = null, array $alternativeNames = []): ?string
    {
        $accessToken = self::getAccessToken();
        if (! $accessToken) {
            return null;
        }

        $parent = $parentFolderId ?: self::folderId();

        try {
            // 1. Search for existing folder by primary name or alternatives
            $allNames = array_unique(array_merge([$folderName], $alternativeNames));
            foreach ($allNames as $name) {
                $query = "name = '{$name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
                if ($parent) {
                    $query .= " and '{$parent}' in parents";
                }

                $searchResponse = Http::withToken($accessToken)
                    ->timeout(15)
                    ->get('https://www.googleapis.com/drive/v3/files', [
                        'q' => $query,
                        'fields' => 'files(id, name)',
                        'supportsAllDrives' => 'true',
                        'includeItemsFromAllDrives' => 'true',
                    ]);

                if ($searchResponse->successful()) {
                    $files = $searchResponse->json('files', []);
                    if (! empty($files) && ! empty($files[0]['id'])) {
                        return $files[0]['id'];
                    }
                }
            }

            // 2. Create the folder if not found (using primary name)
            $createPayload = [
                'name' => $folderName,
                'mimeType' => 'application/vnd.google-apps.folder',
            ];
            if ($parent) {
                $createPayload['parents'] = [$parent];
            }

            $createResponse = Http::withToken($accessToken)
                ->timeout(15)
                ->post('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', $createPayload);

            if ($createResponse->successful()) {
                $folderId = $createResponse->json('id');
                Log::info("Google Drive created folder '{$folderName}': {$folderId}");
                return $folderId;
            }
        } catch (Throwable $e) {
            Log::error("Google Drive getOrCreateFolder exception: {$e->getMessage()}");
        }

        return null;
    }

    /**
     * Get a valid access token using the refresh token, with caching.
     */
    public static function getAccessToken(): ?string
    {
        if (! self::isConfigured()) {
            return null;
        }

        $cachedToken = Cache::get('google_drive_access_token');
        if ($cachedToken && is_string($cachedToken)) {
            return $cachedToken;
        }

        try {
            $response = Http::asForm()->timeout(15)->post('https://oauth2.googleapis.com/token', [
                'client_id' => self::clientId(),
                'client_secret' => self::clientSecret(),
                'refresh_token' => self::refreshToken(),
                'grant_type' => 'refresh_token',
            ]);

            if (! $response->successful()) {
                $status = $response->status();
                $body = $response->body();
                Log::error('Google Drive OAuth token refresh failed', ['status' => $status, 'body' => $body]);
                Cache::forget('google_drive_access_token');
                return null;
            }

            $json = $response->json();
            $token = $json['access_token'] ?? null;
            $expiresIn = (int) ($json['expires_in'] ?? 3600);

            if ($token) {
                // Cache slightly less than expires_in (e.g. 50 minutes for a 1-hour token)
                Cache::put('google_drive_access_token', $token, max(60, $expiresIn - 600));
                return $token;
            }

            return null;
        } catch (Throwable $e) {
            Log::error('Google Drive token exception: ' . $e->getMessage());
            Cache::forget('google_drive_access_token');
            return null;
        }
    }

    /**
     * Extract a Google Drive file ID from a URL, link, or raw string.
     */
    public static function extractFileId(?string $pathOrUrl): ?string
    {
        if (! $pathOrUrl) {
            return null;
        }

        $clean = trim($pathOrUrl);

        // 1. Matches: drive.google.com/file/d/([a-zA-Z0-9_-]+)
        if (preg_match('#drive\.google\.com/file/d/([a-zA-Z0-9_-]+)#i', $clean, $m)) {
            return $m[1];
        }

        // 2. Matches: id=([a-zA-Z0-9_-]+)
        if (preg_match('#[?&]id=([a-zA-Z0-9_-]+)#i', $clean, $m)) {
            return $m[1];
        }

        // 3. Matches: lh3.googleusercontent.com/d/([a-zA-Z0-9_-]+)
        if (preg_match('#googleusercontent\.com/d/([a-zA-Z0-9_-]+)#i', $clean, $m)) {
            return $m[1];
        }

        // 4. Raw file ID (typically 25 to 50 characters, only alphanumeric and _ -)
        if (preg_match('/^[a-zA-Z0-9_-]{25,60}$/', $clean)) {
            return $clean;
        }

        return null;
    }

    /**
     * Upload binary content to Google Drive.
     *
     * @throws \RuntimeException If upload fails
     */
    public static function upload(
        string $binaryContent,
        string $fileName,
        string $mimeType = 'image/jpeg',
        ?string $customFolderId = null
    ): array {
        $accessToken = self::getAccessToken();
        if (! $accessToken) {
            $msg = 'تعذر الاتصال بـ Google Drive: انتهت صلاحية رمز الدخول (OAuth Token Expired) أو لم يتم إعداده بشكل صحيح.';
            Log::error('Google Drive upload aborted: No valid access token.');
            throw new \RuntimeException($msg);
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
                ->timeout(45)
                ->withHeaders([
                    'Content-Type' => "multipart/related; boundary={$boundary}",
                    'Content-Length' => strlen($body),
                ])
                ->withBody($body, "multipart/related; boundary={$boundary}")
                ->post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink,size');

            if (! $response->successful()) {
                $status = $response->status();
                $errBody = $response->body();
                Log::error('Google Drive upload failed', ['status' => $status, 'body' => $errBody]);
                throw new \RuntimeException("فشل رفع الملف إلى Google Drive (HTTP {$status}): " . substr($errBody, 0, 300));
            }

            $data = $response->json();
            $fileId = $data['id'] ?? null;

            if (! $fileId) {
                throw new \RuntimeException('استجاب Google Drive بنجاح ولكن لم يتم إرجاع معرف الملف (File ID).');
            }

            // Attempt to ensure file is readable with the link
            self::makeFilePubliclyReadable($accessToken, $fileId);

            $webViewLink = $data['webViewLink'] ?? "https://drive.google.com/file/d/{$fileId}/view";
            $webContentLink = $data['webContentLink'] ?? "https://drive.google.com/uc?id={$fileId}&export=download";

            Log::info("Google Drive upload successful for {$fileName}: {$webViewLink} (ID: {$fileId})");

            return [
                'disk' => 'google_drive',
                'id' => $fileId,
                'drive_id' => $fileId,
                'path' => $webViewLink,
                'url' => $webViewLink,
                'download_url' => $webContentLink,
                'name' => $fileName,
                'size' => strlen($binaryContent),
                'mime_type' => $mimeType,
            ];
        } catch (\RuntimeException $e) {
            throw $e;
        } catch (Throwable $e) {
            Log::error('Google Drive upload exception: ' . $e->getMessage());
            throw new \RuntimeException('حدث استثناء غير متوقع أثناء الرفع إلى Google Drive: ' . $e->getMessage());
        }
    }

    /**
     * Upload an invoice document to the dedicated "الفواتير" folder in Google Drive.
     *
     * @throws \RuntimeException If upload fails
     */
    public static function uploadInvoice(
        string $binaryContent,
        string $fileName,
        string $mimeType = 'application/pdf'
    ): array {
        $invoicesFolderId = self::invoicesFolderId();
        return self::upload($binaryContent, $fileName, $mimeType, $invoicesFolderId);
    }

    /**
     * Upload a quote document to the dedicated "عروض الأسعار" folder in Google Drive.
     *
     * @throws \RuntimeException If upload fails
     */
    public static function uploadQuote(
        string $binaryContent,
        string $fileName,
        string $mimeType = 'application/pdf'
    ): array {
        $quotesFolderId = self::quotesFolderId();
        return self::upload($binaryContent, $fileName, $mimeType, $quotesFolderId);
    }

    /**
     * Upload a delivery receipt / warehouse note document to the dedicated "أذونات استلام إشبيليا" folder in Google Drive.
     *
     * @throws \RuntimeException If upload fails
     */
    public static function uploadReceipt(
        string $binaryContent,
        string $fileName,
        string $mimeType = 'image/jpeg'
    ): array {
        $receiptsFolderId = self::receiptsFolderId();
        return self::upload($binaryContent, $fileName, $mimeType, $receiptsFolderId);
    }

    /**
     * Stream a file directly from Google Drive API to the client browser (authenticated proxy stream).
     */
    public static function streamFile(
        string $fileIdOrPath,
        ?string $fileName = null,
        ?string $mimeType = null,
        bool $download = false
    ): Response {
        $fileId = self::extractFileId($fileIdOrPath) ?: $fileIdOrPath;
        $accessToken = self::getAccessToken();

        if (! $accessToken) {
            abort(502, 'تعذر التحقق من مصادقة Google Drive لعرض الملف.');
        }

        try {
            $response = Http::withToken($accessToken)
                ->timeout(45)
                ->get("https://www.googleapis.com/drive/v3/files/{$fileId}?alt=media&supportsAllDrives=true");

            if (! $response->successful()) {
                Log::warning("Google Drive stream failed for file {$fileId}", ['status' => $response->status()]);
                abort($response->status() === 404 ? 404 : 502, 'الملف غير متاح على Google Drive أو تم حذفه.');
            }

            $resolvedName = $fileName ?: "drive_file_{$fileId}";
            $resolvedMime = $mimeType ?: $response->header('Content-Type') ?: 'application/octet-stream';
            $content = $response->body();

            return response($content, 200, [
                'Content-Type' => $resolvedMime,
                'Content-Length' => strlen($content),
                'Content-Disposition' => ($download ? 'attachment' : 'inline') . '; filename="' . $resolvedName . '"',
                'Cache-Control' => 'private, max-age=86400',
            ]);
        } catch (Throwable $e) {
            Log::error("Google Drive streaming exception for {$fileId}: " . $e->getMessage());
            abort(502, 'تعذر استرجاع الملف من Google Drive: ' . $e->getMessage());
        }
    }

    /**
     * Grant 'reader' role to 'anyone' with link so receipt photos can be viewed directly if needed.
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

    /**
     * Test Google Drive connection and report status.
     */
    public static function testConnection(): array
    {
        if (! self::isConfigured()) {
            return [
                'success' => false,
                'configured' => false,
                'error' => 'إعدادات Google Drive غير مكتملة في متغيرات البيئة (client_id, client_secret, refresh_token, folder_id).',
            ];
        }

        $token = self::getAccessToken();
        if (! $token) {
            return [
                'success' => false,
                'configured' => true,
                'token_valid' => false,
                'error' => 'فشلت المصادقة مع Google OAuth: رمز التحديث Refresh Token منتهي الصلاحية أو غير صالح (invalid_grant).',
            ];
        }

        $folderId = self::folderId();
        try {
            $res = Http::withToken($token)
                ->timeout(15)
                ->get("https://www.googleapis.com/drive/v3/files/{$folderId}?supportsAllDrives=true&fields=id,name,capabilities");

            if (! $res->successful()) {
                return [
                    'success' => false,
                    'configured' => true,
                    'token_valid' => true,
                    'error' => "تعذر الوصول للمجلد المطلوب (HTTP {$res->status()}): " . $res->body(),
                ];
            }

            $data = $res->json();
            return [
                'success' => true,
                'configured' => true,
                'token_valid' => true,
                'folder_id' => $data['id'] ?? $folderId,
                'folder_name' => $data['name'] ?? 'مجلد المشتريات',
                'can_add_children' => $data['capabilities']['canAddChildren'] ?? false,
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'configured' => true,
                'token_valid' => true,
                'error' => 'حدث استثناء أثناء الاتصال بـ Google Drive: ' . $e->getMessage(),
            ];
        }
    }
}
