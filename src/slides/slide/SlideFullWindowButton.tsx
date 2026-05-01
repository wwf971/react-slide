const SlideFullWindowButton = ({ isFullWindow, onToggleFullWindow }: any) => {
  return (
    <div className="slide-page-full-window-zone">
      <button className="slide-page-full-window-btn" type="button" onClick={onToggleFullWindow}>
        {isFullWindow ? (
          <svg
            className="slide-page-full-window-icon"
            width="20"
            height="20"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path d="M4 1.8H1.8V4" />
            <path d="M8 1.8h2.2V4" />
            <path d="M1.8 8V10.2H4" />
            <path d="M8 10.2h2.2V8" />
          </svg>
        ) : (
          <svg
            className="slide-page-full-window-icon"
            width="20"
            height="20"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path d="M1.8 4V1.8H4" />
            <path d="M8 1.8h2.2V4" />
            <path d="M1.8 8v2.2H4" />
            <path d="M8 10.2h2.2V8" />
          </svg>
        )}
      </button>
    </div>
  );
};

export default SlideFullWindowButton;
