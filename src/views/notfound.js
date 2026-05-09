export async function pageNotFound({ routeView }) {
  routeView.innerHTML = `
    <div class="card">
      <div class="cardBody">
        <div class="cardTitle">Not found</div>
        <div class="cardSub">That page does not exist.</div>
      </div>
    </div>
  `;
}
