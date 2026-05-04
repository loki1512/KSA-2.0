// offers.js - Admin offers management

let currentOfferId = null;
let showInactive = false;

document.addEventListener('DOMContentLoaded', function() {
    loadOffers();

    document.getElementById('create-offer-btn').addEventListener('click', () => openModal());
    document.getElementById('show-inactive').addEventListener('change', (e) => {
        showInactive = e.target.checked;
        loadOffers();
    });

    document.querySelector('.close').addEventListener('click', () => closeModal());
    document.getElementById('offer-form').addEventListener('submit', saveOffer);
});

async function loadOffers() {
    try {
        const response = await fetch(`/api/offers?show_inactive=${showInactive}`);
        const offers = await response.json();
        renderOffers(offers);
    } catch (error) {
        console.error('Error loading offers:', error);
    }
}

function renderOffers(offers) {
    const container = document.getElementById('offers-list');
    container.innerHTML = '';

    if (offers.length === 0) {
        container.innerHTML = '<p>No offers found.</p>';
        return;
    }

    offers.forEach(offer => {
        const offerEl = document.createElement('div');
        offerEl.className = `offer-item ${offer.is_active ? 'active' : 'inactive'}`;
        offerEl.innerHTML = `
            <div class="offer-header">
                <h3>${offer.product_name}</h3>
                <div class="offer-actions">
                    <button onclick="editOffer(${offer.id})" class="btn btn-secondary">Edit</button>
                    <button onclick="toggleActive(${offer.id}, ${offer.is_active})" class="btn ${offer.is_active ? 'btn-warning' : 'btn-success'}">
                        ${offer.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onclick="deleteOffer(${offer.id})" class="btn btn-danger">Delete</button>
                </div>
            </div>
            <p>${offer.offer_description}</p>
            <div class="offer-meta">
                <span>Created: ${new Date(offer.created_at).toLocaleDateString()}</span>
                ${offer.expiry_date ? `<span>Expires: ${new Date(offer.expiry_date).toLocaleString()}</span>` : ''}
            </div>
        `;
        container.appendChild(offerEl);
    });
}

function openModal(offer = null) {
    const modal = document.getElementById('offer-modal');
    const form = document.getElementById('offer-form');

    if (offer) {
        document.getElementById('modal-title').textContent = 'Edit Offer';
        document.getElementById('product_name').value = offer.product_name;
        document.getElementById('offer_description').value = offer.offer_description;
        document.getElementById('is_active').checked = offer.is_active;
        document.getElementById('expiry_date').value = offer.expiry_date ? new Date(offer.expiry_date).toISOString().slice(0, 16) : '';
        currentOfferId = offer.id;
    } else {
        document.getElementById('modal-title').textContent = 'Create Offer';
        form.reset();
        currentOfferId = null;
    }

    modal.style.display = 'block';
}

function closeModal() {
    document.getElementById('offer-modal').style.display = 'none';
    currentOfferId = null;
}

async function saveOffer(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const data = {
        product_name: formData.get('product_name'),
        offer_description: formData.get('offer_description'),
        is_active: formData.get('is_active') === 'on',
        expiry_date: formData.get('expiry_date') || null
    };

    try {
        const url = currentOfferId ? `/api/offers/${currentOfferId}` : '/api/offers';
        const method = currentOfferId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeModal();
            loadOffers();
        } else {
            const error = await response.json();
            alert(error.message || 'Error saving offer');
        }
    } catch (error) {
        console.error('Error saving offer:', error);
        alert('Error saving offer');
    }
}

async function editOffer(id) {
    try {
        const response = await fetch('/api/offers');
        const offers = await response.json();
        const offer = offers.find(o => o.id === id);
        if (offer) {
            openModal(offer);
        }
    } catch (error) {
        console.error('Error loading offer for edit:', error);
    }
}

async function toggleActive(id, currentlyActive) {
    const action = currentlyActive ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this offer?`)) return;

    try {
        const response = await fetch(`/api/offers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: !currentlyActive })
        });

        if (response.ok) {
            loadOffers();
        } else {
            const error = await response.json();
            alert(error.message || 'Error updating offer');
        }
    } catch (error) {
        console.error('Error updating offer:', error);
    }
}

async function deleteOffer(id) {
    if (!confirm('Are you sure you want to permanently delete this offer? This cannot be undone.')) return;

    try {
        const response = await fetch(`/api/offers/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadOffers();
        } else {
            const error = await response.json();
            alert(error.message || 'Error deleting offer');
        }
    } catch (error) {
        console.error('Error deleting offer:', error);
    }
}