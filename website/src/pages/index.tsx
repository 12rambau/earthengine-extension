import Layout from '@theme/Layout';

export default function HomePage() {
  return (
    <Layout
      title="Earth Engine for VS Code"
      description="Google Earth Engine directly inside your editor."
      noFooter
    >
      <main className="site-landing">
        <div className="site-landing__logo-column" aria-hidden="true">
          <img className="site-landing__logo" src="/icon.png" alt="" />
        </div>
        <section className="site-landing__hero" aria-labelledby="landing-title">
          <p className="site-landing__eyebrow">Earth Engine for VS Code</p>
          <h1 id="landing-title">Earth Engine, inside your editor.</h1>
          <p className="site-landing__summary">
            Browse assets, follow operations, explore the catalog and API, and visualise Earth
            Engine layers without leaving VS Code.
          </p>
        </section>

        <section className="site-landing__video" aria-label="Extension walkthrough video">
          <div className="site-landing__video-frame">
            <span className="site-landing__video-label">Extension walkthrough</span>
            <strong>Video recording placeholder</strong>
            <span>Product recording will appear here.</span>
          </div>
        </section>
      </main>
    </Layout>
  );
}