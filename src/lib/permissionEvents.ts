/**
 * Global permission event system for real-time permission updates
 * This ensures that when permissions are updated, all components immediately reflect the changes
 */

type PermissionEventHandler = (permissions: any) => void;

class PermissionEventEmitter {
  private listeners: Map<string, PermissionEventHandler[]> = new Map();

  /**
   * Subscribe to permission changes
   * @param event - Event name (e.g., 'permissions-updated', 'role-updated')
   * @param handler - Callback function
   * @returns Unsubscribe function
   */
  subscribe(event: string, handler: PermissionEventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    
    const handlers = this.listeners.get(event)!;
    handlers.push(handler);
    
    // Return unsubscribe function
    return () => {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
  }

  /**
   * Emit permission change event
   * @param event - Event name
   * @param data - Event data (typically updated permissions)
   */
  emit(event: string, data: any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error('Error in permission event handler:', error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event
   * @param event - Event name
   */
  removeAllListeners(event: string): void {
    this.listeners.delete(event);
  }

  /**
   * Get number of listeners for an event
   * @param event - Event name
   * @returns Number of listeners
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.length || 0;
  }
}

// Global instance
export const permissionEvents = new PermissionEventEmitter();

// Event constants
export const PERMISSION_EVENTS = {
  PERMISSIONS_UPDATED: 'permissions-updated',
  ROLE_UPDATED: 'role-updated',
  USER_ROLE_CHANGED: 'user-role-changed',
  USER_STATUS_CHANGED: 'user-status-changed',
  FORCE_RELOAD: 'force-reload', // Force page reload for specific users
  BROADCAST_RELOAD: 'broadcast-reload', // Broadcast reload to all users with specific role
} as const;
