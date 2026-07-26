/**
 * A quiet spam tripwire. It stays outside the viewport and keyboard order,
 * while remaining a normal text field that basic autofill bots tend to fill.
 */
export default function BotTrapFields() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "-10000px",
        width: "1px",
        height: "1px",
        overflow: "hidden",
      }}
    >
      <label>
        Fax
        <input
          type="text"
          name="contact_fax"
          tabIndex={-1}
          autoComplete="off"
        />
      </label>
    </div>
  );
}
