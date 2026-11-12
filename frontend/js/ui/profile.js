/* Окно профиля: аватар (с каруселью фото), ник, @логин, описание; редактирование ника и описания. */
import { $ } from '../dom.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { avatar } from './avatar.js';
import { toast } from './toast.js';
import { openEditor } from '../editor/editor-modal.js';

export const displayName = (u) => u.display_name || u.username;

/** onChange(user) — после сохранения; onAvatars() — открыть карусель своих фото. */
export function initProfile({ onChange, onAvatars }) {
  const setEditing = (on) => {
    $('#profile-view').hidden = on; $('#profile-edit').hidden = !on;
    $('#profile-footer').hidden = !on;
    $('#modal-settings-title').textContent = on ? 'Изменить профиль' : 'Профиль';
  };

  function renderView() {
    const u = state.user;
    $('#profile-avatar').replaceChildren(avatar(displayName(u), { user: u, big: true }));
    $('#profile-name').textContent = displayName(u);
    $('#profile-login').textContent = `@${u.username}`;
    const bio = $('#profile-bio');
    bio.textContent = u.bio || 'Описание не добавлено';
    bio.classList.toggle('is-empty', !u.bio);
  }

  /** Загружает фото и делает его текущим; прежние остаются в карусели. */
  async function uploadAvatar(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Выберите картинку.'); return; }
    // Подтверждение через круглую маску: можно двигать, масштабировать и править фото тем же редактором
    const edited = await openEditor(file, { avatar: true });
    if (!edited) return;
    try {
      const media = await api.uploadMedia(edited.file);
      onChange(await api.updateProfile({ avatar_id: media.id }));
      toast('Фото профиля обновлено');
    } catch (e) { toast(e.message || 'Не удалось загрузить фото.'); }
  }
  const pick = () => $('#avatar-file').click();
  $('#avatar-file').addEventListener('change', () => { const f = $('#avatar-file').files[0]; $('#avatar-file').value = ''; uploadAvatar(f); });
  $('#profile-photo-btn').addEventListener('click', pick);
  $('#profile-avatar-edit').addEventListener('click', pick);
  $('#profile-avatar').addEventListener('click', () => onAvatars?.());

  function renderEditAvatar() {
    $('#profile-avatar-edit').replaceChildren(avatar(displayName(state.user), { user: state.user, big: true }));
  }
  $('#profile-edit-btn').addEventListener('click', () => {
    const u = state.user;
    $('#profile-nick').value = displayName(u);
    $('#profile-login-ro').value = `@${u.username}`;
    $('#profile-bio-input').value = u.bio || '';
    setEditing(true); renderEditAvatar();
  });
  $('#profile-cancel').addEventListener('click', () => setEditing(false));

  $('#profile-save').addEventListener('click', async () => {
    if (!$('#profile-nick').value.trim()) { toast('Укажите ник.'); $('#profile-nick').focus(); return; }
    const btn = $('#profile-save'); btn.disabled = true;
    try {
      const updated = await api.updateProfile({ display_name: $('#profile-nick').value, bio: $('#profile-bio-input').value });
      setEditing(false);
      onChange(updated);
      toast('Профиль сохранён');
    } catch (e) { toast(e.message || 'Не удалось сохранить профиль.'); }
    finally { btn.disabled = false; }
  });

  return {
    /** Вызывать при каждом открытии окна и после изменения профиля. */
    render() { setEditing(false); renderView(); },
  };
}
