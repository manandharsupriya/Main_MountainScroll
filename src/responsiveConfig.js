export const responsiveConfig = {
  breakpoints: {
    mobile: 0,          // width <= 767px
    tablet: 768,        // 768px <= width <= 1199px
    desktop: 1200       // width >= 1200px
  },
  // the larger the distance scale number, the further the camera
  distanceScale: {
    mobile: 1.0,
    tablet: 0.75,        // multiply mobile defaultDistance by this number
    desktop: 0.5          // multiply mobile defaultDistance by this number
  }
};
