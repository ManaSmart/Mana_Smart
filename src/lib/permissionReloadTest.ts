/**
 * Test utility for permission reload mechanism
 * This can be used to verify that the permission reload system works correctly
 * Call from browser console: window.testPermissionReload()
 */

import { permissionEvents, PERMISSION_EVENTS } from './permissionEvents';
import { refreshPermissionsForRole } from './permissionRefresh';

// Make test function available globally
declare global {
  interface Window {
    testPermissionReload: (roleId?: string) => void;
    testForceReload: (userId?: string) => void;
    testBroadcastReload: (roleId?: string) => void;
  }
}

/**
 * Test the permission reload mechanism
 * This simulates what happens when an admin updates a role
 */
export function testPermissionReload(roleId?: string) {
  console.log('🧪 Testing permission reload mechanism...');
  
  // Get current user info from localStorage
  const stored = localStorage.getItem('auth_user');
  if (!stored) {
    console.error('❌ No user logged in. Please login first.');
    return;
  }
  
  const currentUser = JSON.parse(stored);
  const testRoleId = roleId || currentUser.role_id;
  
  if (!testRoleId) {
    console.error('❌ No role ID found and none provided.');
    return;
  }
  
  console.log(`📋 Testing with role ID: ${testRoleId}`);
  console.log(`👤 Current user: ${currentUser.full_name} (${currentUser.email})`);
  
  // Simulate role update by calling refreshPermissionsForRole
  refreshPermissionsForRole(testRoleId)
    .then(() => {
      console.log('✅ Permission refresh completed successfully');
      console.log('🔄 Check if your page reloads after 1.5 seconds...');
    })
    .catch((error) => {
      console.error('❌ Permission refresh failed:', error);
    });
}

/**
 * Test force reload for specific user
 */
export function testForceReload(userId?: string) {
  console.log('🧪 Testing force reload mechanism...');
  
  const stored = localStorage.getItem('auth_user');
  if (!stored) {
    console.error('❌ No user logged in. Please login first.');
    return;
  }
  
  const currentUser = JSON.parse(stored);
  const testUserId = userId || currentUser.user_id;
  
  console.log(`📋 Testing force reload for user ID: ${testUserId}`);
  
  // Emit force reload event
  permissionEvents.emit(PERMISSION_EVENTS.FORCE_RELOAD, {
    userId: testUserId,
    reason: 'test-force-reload'
  });
  
  console.log('✅ Force reload event emitted');
}

/**
 * Test broadcast reload for specific role
 */
export function testBroadcastReload(roleId?: string) {
  console.log('🧪 Testing broadcast reload mechanism...');
  
  const stored = localStorage.getItem('auth_user');
  if (!stored) {
    console.error('❌ No user logged in. Please login first.');
    return;
  }
  
  const currentUser = JSON.parse(stored);
  const testRoleId = roleId || currentUser.role_id;
  
  console.log(`📋 Testing broadcast reload for role ID: ${testRoleId}`);
  
  // Emit broadcast reload event
  permissionEvents.emit(PERMISSION_EVENTS.BROADCAST_RELOAD, {
    roleId: testRoleId,
    userCount: 1,
    reason: 'test-broadcast-reload'
  });
  
  console.log('✅ Broadcast reload event emitted');
}

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  window.testPermissionReload = testPermissionReload;
  window.testForceReload = testForceReload;
  window.testBroadcastReload = testBroadcastReload;
  
  console.log('🧪 Permission reload test functions available:');
  console.log('  - window.testPermissionReload(roleId?)');
  console.log('  - window.testForceReload(userId?)');
  console.log('  - window.testBroadcastReload(roleId?)');
}
