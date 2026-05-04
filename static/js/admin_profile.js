'use strict';

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  document.getElementById('profileSaveBtn').addEventListener('click', saveProfile);
  document.getElementById('profileCurrentPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveProfile();
  });
});

async function loadProfile() {
  try {
    const res = await fetch('/api/admin/profile');
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to load profile');
    document.getElementById('profileEmail').value = data.email || '';
  } catch {
    showMessage('Could not load profile.', 'error');
  }
}

async function saveProfile() {
  const btn = document.getElementById('profileSaveBtn');
  const payload = {
    email: document.getElementById('profileEmail').value.trim(),
    password: document.getElementById('profilePassword').value,
    password_confirm: document.getElementById('profilePasswordConfirm').value,
    current_password: document.getElementById('profileCurrentPassword').value
  };

  if (!payload.current_password) {
    showMessage('Current password required.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const res = await fetch('/api/admin/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(data.message || 'Update failed.', 'error');
      return;
    }

    document.getElementById('profileEmail').value = data.email || payload.email;
    document.getElementById('profilePassword').value = '';
    document.getElementById('profilePasswordConfirm').value = '';
    document.getElementById('profileCurrentPassword').value = '';
    showMessage(data.message || 'Profile updated.', 'success');
  } catch {
    showMessage('Could not update profile.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

function showMessage(message, type) {
  const el = document.getElementById('profileMessage');
  el.textContent = message;
  el.className = `profile-message ${type}`;
  el.style.display = 'block';
}
