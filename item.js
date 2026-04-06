const PHONE = "5492235831244";

const params = new URLSearchParams(window.location.search);
const id = parseInt(params.get("id"));

fetch("items.json")
  .then(res => res.json())
  .then(items => {
    const item = items.find(i => i.id === id);
    renderItem(item);
  });

function renderItem(item) {
  const container = document.getElementById("item-detail");

  const message = encodeURIComponent(
    `Hola! Me interesa: ${item.title} (${item.year})`
  );

  container.innerHTML = `
    <div class="detail">
      <div class="gallery">
        ${item.images.map(img => `<img src="${img}" />`).join("")}
      </div>

      <div class="info">
        <h1>${item.title}</h1>
        <p>${item.country} • ${item.year}</p>
        <p><strong>Estado:</strong> ${item.condition}</p>
        <p class="price">${item.price}</p>
        <p class="desc">${item.description}</p>

        <button onclick="buy('${message}')">
          Consultar por WhatsApp
        </button>
      </div>
    </div>
  `;
}

function buy(message) {
  window.open(`https://wa.me/${PHONE}?text=${message}`, "_blank");
}