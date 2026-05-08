const offerForm = document.getElementById('offerForm');
const editingOfferId = document.getElementById('editingOfferId');
const productName = document.getElementById('productName');
const offerDescription = document.getElementById('offerDescription');
const offerImage = document.getElementById('offerImage');
const offerActive = document.getElementById('offerActive');
const offerMessage = document.getElementById('offerMessage');
const offerFormTitle = document.getElementById('offerFormTitle');
const saveOfferBtn = document.getElementById('saveOfferBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const adminOfferList = document.getElementById('adminOfferList');
const offerCount = document.getElementById('offerCount');
const leadMessage = document.getElementById('leadMessage');
const adminLeadTable = document.getElementById('adminLeadTable');
const leadCount = document.getElementById('leadCount');
let offersById = new Map();
let leadsById = new Map();
const leadStatusOptions = ['Interested', 'Contacted', 'Converted', 'Rejected'];

function setMessage(message, type = 'success') {
  offerMessage.textContent = message;
  offerMessage.className = `form-message ${type}`;
  offerMessage.style.display = 'block';
}

function clearMessage() {
  offerMessage.style.display = 'none';
  offerMessage.textContent = '';
}

function resetForm() {
  offerForm.reset();
  editingOfferId.value = '';
  offerActive.checked = true;
  offerFormTitle.textContent = 'Create Offer';
  saveOfferBtn.textContent = 'Save Offer';
  cancelEditBtn.style.display = 'none';
  clearMessage();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

async function loadOffers() {
  adminOfferList.innerHTML = '<div class="empty-offers compact">Loading offers...</div>';
  const res = await fetch('/api/admin/offers');
  const offers = await res.json();
  offersById = new Map(offers.map(offer => [offer.id, offer]));
  offerCount.textContent = offers.length;

  if (!offers.length) {
    adminOfferList.innerHTML = '<div class="empty-offers compact">No offers created yet.</div>';
    return;
  }

  adminOfferList.innerHTML = offers.map(offer => `
    <article class="admin-offer-item">
      <div class="admin-offer-thumb">
        ${offer.image_url ? `<img src="${offer.image_url}" alt="${escapeHtml(offer.product_name)}">` : '<span>KSA</span>'}
      </div>
      <div class="admin-offer-main">
        <div class="admin-offer-topline">
          <h4>${escapeHtml(offer.product_name)}</h4>
          <span class="status-pill ${offer.is_active ? 'active' : 'inactive'}">${offer.is_active ? 'Active' : 'Hidden'}</span>
        </div>
        <p>${escapeHtml(offer.offer_description)}</p>
        <div class="admin-offer-meta">Created ${formatDate(offer.created_at)}</div>
        <div class="admin-offer-actions">
          <button class="btn btn-ghost" type="button" onclick="editOffer(${offer.id})">Edit</button>
          <button class="btn btn-danger" type="button" onclick="deleteOffer(${offer.id})">Delete</button>
        </div>
      </div>
    </article>
  `).join('');
}

async function setLeadMessage(message, type = 'success') {
  if (!leadMessage) return;
  leadMessage.textContent = message;
  leadMessage.className = `form-message ${type}`;
  leadMessage.style.display = 'block';
}

function clearLeadMessage() {
  if (!leadMessage) return;
  leadMessage.style.display = 'none';
  leadMessage.textContent = '';
}

function renderLeadRow(lead) {
  const statusOptions = leadStatusOptions.map(status => `
      <option value="${status}" ${status === lead.status ? 'selected' : ''}>${status}</option>
    `).join('');

  return `
    <tr>
      <td>${escapeHtml(lead.customer_name || 'Unknown')}</td>
      <td>${escapeHtml(lead.customer_phone || '-')}</td>
      <td>${escapeHtml(lead.customer_village || '-')}</td>
      <td>${escapeHtml(lead.offer_name || '(removed)')}</td>
      <td>
        <select class="lead-status-select" onchange="changeLeadStatus(${lead.id}, this.value)">
          ${statusOptions}
        </select>
      </td>
      <td>${escapeHtml(formatDate(lead.created_at))}</td>
      <td>
        <button class="btn btn-danger" type="button" onclick="deleteLead(${lead.id})">Delete</button>
      </td>
    </tr>
  `;
}

async function loadLeads() {
  adminLeadTable.innerHTML = '<tr><td colspan="7" class="empty-leads">Loading leads...</td></tr>';

  try {
    const res = await fetch('/api/admin/leads');
    if (!res.ok) {
      adminLeadTable.innerHTML = '<tr><td colspan="7" class="empty-leads">Unable to load leads.</td></tr>';
      return;
    }
    const leads = await res.json();
    leadsById = new Map(leads.map(lead => [lead.id, lead]));
    leadCount.textContent = leads.length;

    if (!leads.length) {
      adminLeadTable.innerHTML = '<tr><td colspan="7" class="empty-leads">No leads captured yet.</td></tr>';
      return;
    }

    adminLeadTable.innerHTML = leads.map(renderLeadRow).join('');
  } catch (err) {
    adminLeadTable.innerHTML = '<tr><td colspan="7" class="empty-leads">Failed to load leads.</td></tr>';
  }
}

window.changeLeadStatus = async function(id, status) {
  clearLeadMessage();
  try {
    const res = await fetch(`/api/admin/leads/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    if (!res.ok) {
      const payload = await res.json();
      setLeadMessage(payload.error || 'Unable to update lead status', 'error');
      return;
    }

    setLeadMessage('Lead status updated successfully');
    await loadLeads();
  } catch (err) {
    setLeadMessage('Network error while updating lead status', 'error');
  }
};

window.deleteLead = async function(id) {
  if (!confirm('Delete this lead?')) return;
  clearLeadMessage();

  try {
    const res = await fetch(`/api/admin/leads/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const payload = await res.json();
      setLeadMessage(payload.error || 'Unable to delete lead', 'error');
      return;
    }

    setLeadMessage('Lead deleted successfully');
    await loadLeads();
  } catch (err) {
    setLeadMessage('Network error while deleting lead', 'error');
  }
};

window.editOffer = function(id) {
  const offer = offersById.get(id);
  if (!offer) return;
  editingOfferId.value = offer.id;
  productName.value = offer.product_name;
  offerDescription.value = offer.offer_description;
  offerActive.checked = offer.is_active;
  offerImage.value = '';
  offerFormTitle.textContent = 'Edit Offer';
  saveOfferBtn.textContent = 'Update Offer';
  cancelEditBtn.style.display = 'inline-flex';
  clearMessage();
  productName.focus();
};

window.deleteOffer = async function(id) {
  if (!confirm('Delete this offer?')) return;

  const res = await fetch(`/api/admin/offers/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    setMessage('Unable to delete offer', 'error');
    return;
  }

  resetForm();
  await loadOffers();
};

offerForm.addEventListener('submit', async event => {
  event.preventDefault();
  clearMessage();

  const data = new FormData();
  data.append('product_name', productName.value.trim());
  data.append('offer_description', offerDescription.value.trim());
  data.append('is_active', offerActive.checked ? 'true' : 'false');
  if (offerImage.files[0]) {
    data.append('image', offerImage.files[0]);
  }

  const id = editingOfferId.value;
  const url = id ? `/api/admin/offers/${id}` : '/api/admin/offers';
  const method = id ? 'PUT' : 'POST';

  saveOfferBtn.disabled = true;
  saveOfferBtn.textContent = id ? 'Updating...' : 'Saving...';

  try {
    const res = await fetch(url, { method, body: data });
    const payload = await res.json();

    if (!res.ok) {
      setMessage(payload.error || 'Unable to save offer', 'error');
      return;
    }

    resetForm();
    setMessage(id ? 'Offer updated successfully' : 'Offer created successfully');
    await loadOffers();
  } finally {
    saveOfferBtn.disabled = false;
    saveOfferBtn.textContent = editingOfferId.value ? 'Update Offer' : 'Save Offer';
  }
});

cancelEditBtn.addEventListener('click', resetForm);
loadOffers();
loadLeads();
