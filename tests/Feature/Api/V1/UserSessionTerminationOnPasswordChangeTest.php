<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserSessionTerminationOnPasswordChangeTest extends TestCase
{
    use RefreshDatabase;

    private User $adminUser;
    private User $targetUser;
    private Department $department;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(\Database\Seeders\RolePermissionSeeder::class);

        $this->department = Department::create([
            'name' => 'الهندسة والتطوير',
            'code' => 'ENG',
            'is_active' => true,
        ]);

        $adminRole = Role::where('slug', 'admin')->first();

        $this->adminUser = User::create([
            'department_id' => $this->department->id,
            'name' => 'مدير النظام الرئيسي',
            'email' => 'superadmin@ashbiliya.com',
            'password' => Hash::make('AdminPass123!'),
            'is_active' => true,
        ]);
        $this->adminUser->roles()->attach($adminRole->id);

        $this->targetUser = User::create([
            'department_id' => $this->department->id,
            'name' => 'محمد المهندس',
            'email' => 'engineer@ashbiliya.com',
            'password' => Hash::make('OldPassword123!'),
            'is_active' => true,
        ]);
    }

    public function test_admin_updating_user_password_revokes_all_active_tokens_immediately(): void
    {
        // 1. Target user logs in and gets an active token
        $userToken = $this->targetUser->createToken('mobile_session')->plainTextToken;

        // Verify the token works for authenticated requests
        $responseBefore = $this->withHeader('Authorization', 'Bearer ' . $userToken)
            ->getJson('/api/v1/auth/me');
        $responseBefore->assertStatus(200)
            ->assertJson(['user' => ['email' => 'engineer@ashbiliya.com']]);

        // 2. Admin resets or changes target user's password from admin panel
        \Illuminate\Support\Facades\Auth::forgetGuards();
        $adminToken = $this->adminUser->createToken('admin_session')->plainTextToken;
        $updateResponse = $this->withHeader('Authorization', 'Bearer ' . $adminToken)
            ->putJson("/api/v1/admin/users/{$this->targetUser->id}", [
                'password' => 'BrandNewPassword123!',
            ]);

        $updateResponse->assertStatus(200);

        // 3. Target user attempts any request with their old session token -> Must be 401 Unauthorized!
        \Illuminate\Support\Facades\Auth::forgetGuards();
        $responseAfter = $this->withHeader('Authorization', 'Bearer ' . $userToken)
            ->getJson('/api/v1/auth/me');
        $responseAfter->assertStatus(401);

        // 4. Target user cannot login with the old password anymore
        $loginOldResponse = $this->postJson('/api/v1/auth/login', [
            'email' => 'engineer@ashbiliya.com',
            'password' => 'OldPassword123!',
        ]);
        $loginOldResponse->assertStatus(401);

        // 5. Target user logs in successfully with the new password
        $loginNewResponse = $this->postJson('/api/v1/auth/login', [
            'email' => 'engineer@ashbiliya.com',
            'password' => 'BrandNewPassword123!',
        ]);
        $loginNewResponse->assertStatus(200)
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_admin_deactivating_user_revokes_all_active_tokens(): void
    {
        $userToken = $this->targetUser->createToken('browser_session')->plainTextToken;

        // Verify active token works
        $this->withHeader('Authorization', 'Bearer ' . $userToken)
            ->getJson('/api/v1/auth/me')
            ->assertStatus(200);

        // Admin deactivates target user
        \Illuminate\Support\Facades\Auth::forgetGuards();
        $adminToken = $this->adminUser->createToken('admin_session')->plainTextToken;
        $this->withHeader('Authorization', 'Bearer ' . $adminToken)
            ->deleteJson("/api/v1/admin/users/{$this->targetUser->id}")
            ->assertStatus(200);

        // Target user session is immediately terminated (401 Unauthorized)
        \Illuminate\Support\Facades\Auth::forgetGuards();
        $this->withHeader('Authorization', 'Bearer ' . $userToken)
            ->getJson('/api/v1/auth/me')
            ->assertStatus(401);
    }

    public function test_user_changing_password_revokes_other_sessions_but_keeps_current(): void
    {
        // Session 1 (laptop) and Session 2 (phone)
        $session1 = $this->targetUser->createToken('laptop_session')->plainTextToken;
        $session2 = $this->targetUser->createToken('phone_session')->plainTextToken;

        // User changes password from Session 1
        $response = $this->withHeader('Authorization', 'Bearer ' . $session1)
            ->putJson('/api/v1/auth/password', [
                'current_password' => 'OldPassword123!',
                'new_password' => 'MyOwnNewPassword456!',
                'new_password_confirmation' => 'MyOwnNewPassword456!',
            ]);

        $response->assertStatus(200);

        // Assert token was deleted in database
        $this->assertDatabaseMissing('personal_access_tokens', ['name' => 'phone_session']);
        $this->assertDatabaseHas('personal_access_tokens', ['name' => 'laptop_session']);

        // Current session (session 1) remains valid
        \Illuminate\Support\Facades\Auth::forgetGuards();
        $this->withHeader('Authorization', 'Bearer ' . $session1)
            ->getJson('/api/v1/auth/me')
            ->assertStatus(200);

        // Other session (session 2) is revoked
        \Illuminate\Support\Facades\Auth::forgetGuards();
        $this->withHeader('Authorization', 'Bearer ' . $session2)
            ->getJson('/api/v1/auth/me')
            ->assertStatus(401);
    }
}
