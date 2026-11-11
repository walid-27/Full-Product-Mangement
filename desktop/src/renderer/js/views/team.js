/* Team: organization membership and invitations. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const { esc } = App.util;
  const ui = App.ui;
  let host;
  const canManage = () => ['owner', 'admin'].includes(App.state.session?.role);

  async function load() {
    try {
      const members = await App.api.organizations.members();
      host.innerHTML = `<div class="view__inner"><div class="card"><div class="card__head"><div><h3>${esc(App.state.session.orgName || 'Organization')}</h3><p class="small mute">${members.length} active members · your role: ${esc(App.state.session.role || 'member')}</p></div></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Email</th><th>Role</th>${canManage() ? '<th></th>' : ''}</tr></thead><tbody>${members.map((member) => `<tr><td>${esc(member.user?.name || 'Unknown')}</td><td>${esc(member.user?.email || '')}</td><td>${ui.pill(member.role)}</td>${canManage() ? `<td class="right"><button class="btn btn--quiet btn--sm" data-remove="${esc(member._id)}">Remove</button></td>` : ''}</tr>`).join('')}</tbody></table></div></div></div>`;
      host.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', async () => {
        if (!await ui.confirm({ title: 'Remove team member?', message: 'They will immediately lose access to this organization.', confirmText: 'Remove', danger: true })) return;
        try { await App.api.organizations.removeMember(button.dataset.remove); ui.toast({ type: 'success', title: 'Member removed' }); load(); }
        catch (error) { ui.toast({ type: 'error', title: 'Could not remove member', message: error.message }); }
      }));
    } catch (error) {
      host.innerHTML = `<div class="view__inner"><div class="card"><div class="card__body">${ui.alertBox('error', esc(error.message))}</div></div></div>`;
    }
  }

  function invite() {
    const body = ui.fromHTML('<form id="invite-form" class="col"><label class="field"><span class="field__label">Email</span><input class="input" type="email" name="email" required /></label><label class="field"><span class="field__label">Role</span><select class="input" name="role"><option value="staff">Staff</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label><div id="invite-error" hidden></div></form>');
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
