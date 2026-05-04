// leads.js - Admin leads management

async function updateStatus(leadId, status) {
    try {
        const response = await fetch(`/api/leads/${leadId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: status })
        });

        if (response.ok) {
            location.reload(); // Simple reload for now
        } else {
            const error = await response.json();
            alert(error.message || 'Error updating lead status');
        }
    } catch (error) {
        console.error('Error updating lead status:', error);
        alert('Error updating lead status');
    }
}