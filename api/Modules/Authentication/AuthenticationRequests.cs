namespace MedicalStore.Api.Modules.Authentication;

public sealed record CreateStoreUserRequest(string Email, string Password, string[] Roles, long[]? StoreIds = null);
public sealed record ResetStoreUserPasswordRequest(string NewPassword);
public sealed record UpdateUserRolesRequest(string[] Roles);
public sealed record UpdateUserStatusRequest(bool IsActive);
public sealed record CreateStoreRoleRequest(string Name);
public sealed record UpdateRolePermissionsRequest(string[] Permissions);

