/* Team: organization membership, invitations, roles, audit logs. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const { esc, timeAgo } = App.util;
  const ui = App.ui;
  let host;
  const canManage = () => ['owner', 'admin'].includes(App.state.session?.role);
  const isOwner = () => App.state.session?.role === 'owner';
  const ROLES = ['owner', 'admin', 'staff', 'viewer'];

  async function load() {
    try {
      const [members, audit] = await Promise.all([
        App.api.organizations.members(),
        canManage() ? App.api.organizations.auditLogs({ limit: 25 }).catch(() => null) : Promise.resolve(null)
      ]);
      const logs = (audit && audit.logs) || [];
      host.innerHTML = `<div class="view__inner"><div class="card"><div class="card__head"><div><h3>${esc(App.state.session.orgName || 'Organization')}</h3><p class="small mute">${members.length} active members · your role: ${esc(App.state.session.role || 'member')}</p></div></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Email</th><th>Role</th>${canManage() ? '<th></th>' : ''}</tr></thead><tbody>${members.map((member) => `<tr><td>${esc(member.user?.name || 'Unknown')}</td><td>${esc(member.user?.email || '')}</td><td>${canManage() ? `<select class="input input--sm" data-role-for="${esc(member._id)}" aria-label="Role for ${esc(member.user?.name || 'member')}">${ROLES.map((role) => `<option value="${role}"${role === member.role ? ' selected' : ''}>${role}</option>`).join('')}</select>` : ui.pill(member.role)}</td>${canManage() ? `<td class="right"><button class="btn btn--quiet btn--sm" data-remove="${esc(member._id)}">Remove</button></td>` : ''}</tr>`).join('')}</tbody></table></div></div>
        <div class="card"><div class="card__head"><h3>Accept an invitation</h3><span class="small mute">Paste a token you received</span></div><div class="card__body"><div class="row" style="gap:8px"><input class="input" id="accept-token" placeholder="Invitation token" spellcheck="false" /><button class="btn btn--ghost btn--sm" type="button" id="accept-btn">Accept</button></div></div></div>
        ${canManage() ? `<div class="card"><div class="card__head"><h3>Audit log</h3><span class="small mute">${logs.length} recent entries</span></div><div class="table-wrap"><table class="data"><thead><tr><th>Action</th><th>Entity</th><th>When</th></tr></thead><tbody>${logs.map((log) => `<tr><td>${esc(log.action || '—')}</td><td>${esc(log.entity || '—')}</td><td class="mute">${esc(timeAgo(log.createdAt))}</td></tr>`).join('') || '<tr><td colspan="3" class="mute">No audit entries yet.</td></tr>'}</tbody></table></div></div>` : ''}
        <div class="card"><div class="card__head"><h3>Organization</h3></div><div class="card__body"><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn--ghost btn--sm" type="button" id="leave-org">Leave organization</button>${isOwner() ? '<button class="btn btn--danger btn--sm" type="button" id="delete-org">Delete organization</button>' : ''}</div><p class="small mute" style="margin-top:10px">Leaving or deleting schedules a 30-day grace period. The last owner cannot leave or be removed.</p></div></div>
        </div>`;
      host.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', async () => {
        if (!await ui.confirm({ title: 'Remove team member?', message: 'They will immediately lose access to this organization.', confirmText: 'Remove', danger: true })) return;
        try { await App.api.organizations.removeMember(button.dataset.remove); ui.toast({ type: 'success', title: 'Member removed' }); load(); }
        catch (error) { ui.toast({ type: 'error', title: 'Could not remove member', message: error.message }); }
      }));
      host.querySelectorAll('[data-role-for]').forEach((select) => select.addEventListener('change', async () => {
        select.disabled = true;
        try {
          await App.api.organizations.changeRole(select.getAttribute('data-role-for'), select.value);
          ui.toast({ type: 'success', title: 'Role updated' });
          load();
        } catch (error) {
          ui.toast({ type: 'error', title: 'Could not change role', message: error.message });
          select.disabled = false;
        }
      }));
      const acceptBtn = host.querySelector('#accept-btn');
      if (acceptBtn) acceptBtn.addEventListener('click', async () => {
        const token = host.querySelector('#accept-token').value.trim();
        if (!token) return;
        ui.setBusy(acceptBtn, true);
        try {
          await App.api.organizations.acceptInvite(token);
          ui.toast({ type: 'success', title: 'Invitation accepted', message: 'Switch organizations from the account menu to use it.' });
          load();
        } catch (error) {
          ui.toast({ type: 'error', title: 'Could not accept invitation', message: error.message });
        } finally { ui.setBusy(acceptBtn, false); }
      });
      const leaveBtn = host.querySelector('#leave-org');
      if (leaveBtn) leaveBtn.addEventListener('click', async () => {
        if (!await ui.confirm({ title: 'Leave this organization?', message: 'You will lose access immediately (unless you are the last owner).', confirmText: 'Leave', danger: true })) return;
        try { await App.api.organizations.leave(); ui.toast({ type: 'success', title: 'Left organization' }); App.signOut(); }
        catch (error) { ui.toast({ type: 'error', title: 'Could not leave', message: error.message }); }
      });
      const deleteBtn = host.querySelector('#delete-org');
      if (deleteBtn) deleteBtn.addEventListener('click', async () => {
        if (!await ui.confirm({ title: 'Delete this organization?', message: 'It enters a 30-day deletion grace period and memberships are suspended.', confirmText: 'Delete organization', danger: true })) return;
        try { await App.api.organizations.remove(); ui.toast({ type: 'success', title: 'Organization deletion scheduled' }); App.signOut(); }
        catch (error) { ui.toast({ type: 'error', title: 'Could not delete', message: error.message }); }
      });
    } catch (error) {
      host.innerHTML = `<div class="view__inner"><div class="card"><div class="card__body">${ui.alertBox('error', esc(error.message))}</div></div></div>`;
    }
  }

  function invite() {
    const body = ui.fromHTML('<form id="invite-form" class="col"><label class="field"><span class="field__label">Email</span><input class="input" type="email" name="email" required /></label><label class="field"><span class="field__label">Role</span><select class="input" name="role"><option value="staff">Staff</option><option value="viewer">Viewer</option><option value="admin">Admin</option><option value="owner">Owner</option></select></label><div id="invite-error" hidden></div></form>');
    const foot = ui.fromHTML('<div class="row" style="justify-content:flex-end;width:100%"><button class="btn btn--primary" type="submit" form="invite-form">Send invitation</button></div>');
    const ref = ui.modal({ title: 'Invite a team member', body, footer: foot });
    body.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = foot.querySelector('button'); ui.setBusy(submit, true);
      try {
        const result = await App.api.organizations.invite(body.elements.email.value.trim(), body.elements.role.value);
        ref.close();
        if (result.token) await ui.confirm({ title: 'Invitation created', message: `Share this one-time invitation token: ${result.token}`, confirmText: 'Done' });
        ui.toast({ type: 'success', title: 'Invitation created', message: 'The invitation is valid for seven days.' });
      } catch (error) {
        const box = body.querySelector('#invite-error'); box.hidden = false; box.innerHTML = ui.alertBox('error', esc(error.message));
      } finally { ui.setBusy(submit, false); }
    });
  }

  App.views.team = {
    title: 'Team',
    subtitle: 'Members and invitations for the active organization',
    actions: [{ label: 'Invite member', icon: 'plus', variant: 'primary', onClick: () => canManage() ? invite() : ui.toast({ type: 'error', title: 'Admin access required' }) }],
    async mount(container) { host = container; host.innerHTML = '<div class="view__inner">Loading team…</div>'; await load(); }
  };
})();
