import sys

with open('src/app/services/user-profile.service.ts', 'r') as f:
    content = f.read()

# Fix AppSettings interface
old_interface = """  privacy: {
    shareAnalytics: boolean;
    publicProfile: boolean;
  };
  security: {
    twoFactorEnabled: boolean;
    endToEndEncryption: boolean;
    sessionTimeout: number;
    biometricLock: boolean;
    auditLogEnabled: boolean;
  };
  };
}"""

new_interface = """  privacy: {
    shareAnalytics: boolean;
    publicProfile: boolean;
  };
  security: {
    twoFactorEnabled: boolean;
    endToEndEncryption: boolean;
    sessionTimeout: number;
    biometricLock: boolean;
    auditLogEnabled: boolean;
  };
}"""

content = content.replace(old_interface, new_interface)

# Fix initialProfile object
old_profile = """    privacy: { shareAnalytics: true, publicProfile: true,
    security: {
      twoFactorEnabled: false,
      endToEndEncryption: true,
      sessionTimeout: 3600,
      biometricLock: false,
      auditLogEnabled: true
    } }
  },"""

new_profile = """    privacy: { shareAnalytics: true, publicProfile: true },
    security: {
      twoFactorEnabled: false,
      endToEndEncryption: true,
      sessionTimeout: 3600,
      biometricLock: false,
      auditLogEnabled: true
    }
  },"""

content = content.replace(old_profile, new_profile)

with open('src/app/services/user-profile.service.ts', 'w') as f:
    f.write(content)
