import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';

export default function HomePage() {
  return (
    <Layout
      title="Earth Engine for VS Code"
      description="Google Earth Engine directly inside your editor."
      noFooter
    >
      <main className="site-landing">
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
            <video
              className="site-landing__video-media site-landing__video-media--light"
              autoPlay
              loop
              muted
              playsInline
              onLoadedMetadata={(event) => {
                event.currentTarget.playbackRate = 2;
              }}
              aria-label="Earth Engine for VS Code walkthrough in the light theme"
            >
              <source src={useBaseUrl('/video/light/demo.mp4')} type="video/mp4" />
            </video>
            <video
              className="site-landing__video-media site-landing__video-media--dark"
              autoPlay
              loop
              muted
              playsInline
              onLoadedMetadata={(event) => {
                event.currentTarget.playbackRate = 2;
              }}
              aria-label="Earth Engine for VS Code walkthrough in the dark theme"
            >
              <source src={useBaseUrl('/video/dark/demo.mp4')} type="video/mp4" />
            </video>
          </div>
        </section>
      </main>
    </Layout>
  );
}