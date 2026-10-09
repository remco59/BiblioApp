import { NavLink } from 'react-router-dom';

/** Subnavigatie van Mijn bibliotheek: alles wat van jou is op één plek. */
export function LibraryTabs() {
  return (
    <nav className="subtabs" aria-label="Mijn bibliotheek">
      <NavLink to="/my/loans">Uitleningen</NavLink>
      <NavLink to="/my/wishlist">Verlanglijst</NavLink>
      <NavLink to="/my/suggestions">Suggesties</NavLink>
    </nav>
  );
}
