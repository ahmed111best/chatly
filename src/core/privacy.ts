import type { PrivacySettings, PublicUserSummary, UserProfile, VisibilityLevel } from './types';

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  onlineStatusVisibility: 'contacts',
  lastSeenVisibility: 'contacts',
  profilePhotoVisibility: 'everyone',
  bioVisibility: 'everyone',
  statusUpdatesVisibility: 'contacts',
  contactInfoVisibility: 'nobody',
  readReceiptsEnabled: true,
  typingIndicatorsEnabled: true,
  biometricLockEnabled: false,
};

export function canViewerSeeField(
  visibility: VisibilityLevel,
  isSelf: boolean,
  isContact: boolean
): boolean {
  if (isSelf) return true;
  if (visibility === 'everyone') return true;
  if (visibility === 'contacts') return isContact;
  return false;
}

export function projectPublicUserSummary(
  user: UserProfile,
  privacy: PrivacySettings,
  options: { isSelf: boolean; isContact: boolean; isOnline: boolean }
): PublicUserSummary {
  const showAvatar = canViewerSeeField(
    privacy.profilePhotoVisibility,
    options.isSelf,
    options.isContact
  );
  const showBio = canViewerSeeField(privacy.bioVisibility, options.isSelf, options.isContact);
  const showOnline = canViewerSeeField(
    privacy.onlineStatusVisibility,
    options.isSelf,
    options.isContact
  );
  const showLastSeen = canViewerSeeField(
    privacy.lastSeenVisibility,
    options.isSelf,
    options.isContact
  );

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: showBio ? user.bio : '',
    statusText: user.statusText,
    avatarUrl: showAvatar ? user.avatarUrl : '',
    online: showOnline ? options.isOnline : false,
    lastSeenAt: showLastSeen ? user.lastSeenAt : null,
  };
}

export function countRestrictedControls(privacy: PrivacySettings): {
  restrictedCount: number;
  totalCount: number;
} {
  const visibilityFields: VisibilityLevel[] = [
    privacy.onlineStatusVisibility,
    privacy.lastSeenVisibility,
    privacy.profilePhotoVisibility,
    privacy.bioVisibility,
    privacy.statusUpdatesVisibility,
    privacy.contactInfoVisibility,
  ];
  const restrictedVisibility = visibilityFields.filter((v) => v !== 'everyone').length;
  const restrictedToggles =
    (privacy.readReceiptsEnabled ? 0 : 1) +
    (privacy.typingIndicatorsEnabled ? 0 : 1) +
    (privacy.biometricLockEnabled ? 1 : 0);

  return {
    restrictedCount: restrictedVisibility + restrictedToggles,
    totalCount: visibilityFields.length + 3,
  };
}
