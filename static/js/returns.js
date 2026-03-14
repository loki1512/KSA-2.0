"use strict";

let returnItems = [];
let selectedCustomerId = null;

document.addEventListener("DOMContentLoaded", init);



async function init(){

const params = new URLSearchParams(location.search);

const id = params.get("customer_id");

if(!id){

showToast("Customer required for return","error");

setTimeout(()=>location.href="/customers",1500);

return;

}

selectedCustomerId = parseInt(id);

loadCustomer(id);

setupItemSearch();

}



async function loadCustomer(id){

const res = await fetch(`/api/customers/${id}`);

const c = await res.json();

document.getElementById("custName").textContent = c.name;
document.getElementById("custPhone").textContent = c.phone || "";
document.getElementById("custVillage").textContent = c.village || "";

const avatar = document.getElementById("custAvatar");

avatar.textContent = c.name.charAt(0).toUpperCase();

}



/* ITEM SEARCH */

function setupItemSearch(){

const input = document.getElementById("itemName");

let debounceTimer;

input.addEventListener("input",()=>{

clearTimeout(debounceTimer);

const q = input.value.trim();

if(!q) return;

debounceTimer = setTimeout(()=>fetchItems(q),300);

});

}



async function fetchItems(q){

const res = await fetch(`/api/items/search?q=${encodeURIComponent(q)}`);

const items = await res.json();

renderSuggestions(items);

}



function renderSuggestions(items){

const list = document.getElementById("suggestionList");
const box  = document.getElementById("suggestions");

list.innerHTML="";

items.forEach(item=>{

const div = document.createElement("div");

div.className="suggestion-item";

div.innerHTML=`
<span>${item.name}</span>
<span style="float:right">₹${item.price}</span>
`;

div.onclick=()=>selectItem(item);

list.appendChild(div);

});

box.style.display="block";

}



function selectItem(item){

document.getElementById("itemName").value = item.name;

document.getElementById("price").value = item.price;

document.getElementById("suggestions").style.display="none";

}



/* ADD ITEM */

function addItem(){

const name = document.getElementById("itemName").value.trim();

const qty  = parseFloat(document.getElementById("qty").value);

const rate = parseFloat(document.getElementById("price").value);

if(!name){

showToast("Enter item name","error");

return;

}

const lineTotal = qty * rate;

returnItems.push({
name,
qty,
rate,
lineTotal
});

renderTable();

resetItemInputs();

}



function resetItemInputs(){

document.getElementById("itemName").value="";
document.getElementById("price").value="";
document.getElementById("qty").value=1;

}



/* TABLE */

function renderTable(){

const body = document.getElementById("itemsBody");

body.innerHTML="";

let total=0;

returnItems.forEach((item,i)=>{

total += item.lineTotal;

const tr = document.createElement("tr");

tr.innerHTML=`

<td>${i+1}</td>
<td>${item.name}</td>
<td class="num">₹${fmt(item.rate)}</td>
<td class="num">${item.qty}</td>
<td class="num">₹${fmt(item.lineTotal)}</td>
<td>
<button onclick="removeItem(${i})">✕</button>
</td>

`;

body.appendChild(tr);

});

document.getElementById("subtotal").textContent = fmt(total);

document.getElementById("tableCard").style.display = "block";

document.getElementById("finaliseBar").style.display = "flex";

}



function removeItem(i){

returnItems.splice(i,1);

renderTable();

}



/* SAVE RETURN */

async function saveReturn(){

const total = returnItems.reduce((s,i)=>s+i.lineTotal,0);

const payload = {

customer_id:selectedCustomerId,

totalRefundAmount:total,

items:returnItems.map(i=>({

name:i.name,
qty:i.qty,
rate:i.rate,
lineTotal:i.lineTotal

}))

};

const res = await fetch(`/api/returns/${selectedCustomerId}`,{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify(payload)

});

if(!res.ok){

showToast("Return failed","error");

return;

}

showToast("Return saved","success");
// Go back to ledger after short delay to show toast

setTimeout(()=>location.href=`/customers/${selectedCustomerId}/ledger`,100);

}



/* HELPERS */

function fmt(n){

return parseFloat(n).toFixed(2);

}



function showToast(msg,type=""){

const t = document.getElementById("toast");

t.textContent = msg;

t.className = `toast ${type}`;

t.style.display="block";

setTimeout(()=>t.style.display="none",2500);

}