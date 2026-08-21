type MainMenuButtonProps = {
  onClick: () => void;
};

function MainMenuButton({ onClick }: MainMenuButtonProps) {
  return (
    <button
      className="main-menu-button"
      type="button"
      onClick={onClick}
      aria-label="Return to main menu"
    >
      ← Main Menu
    </button>
  );
}

export default MainMenuButton;
