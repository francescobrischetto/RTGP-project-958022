/*
Project of Francesco Brischetto: This project is based based on "Geometry-based shading for shape depiction enhancement".
                                 It applies an NPR effect to the illumination model that enhances object shape 
                                 based on object local geometry

illumination_models_modified_fr.frag: Fragment shader for the Lambert, Blinn-Phong and TBD illumination models
It receives smoothed surface normal, computed in model loading phase, that will be used to calculate the sharpened surface

N.B. 1)  "illumination_models_modified_vt.vert" must be used as vertex shader

N.B. 2)  the different illumination models are implemented using Shaders Subroutines

author: Davide Gadia
refined by: Francesco Brischetto  mat. 958022

Real-Time Graphics Programming - a.a. 2020/2021
Master degree in Computer Science
Universita' degli Studi di Milano

*/

#version 410 core

const float PI = 3.14159265359;

// output shader variable
out vec4 colorFrag;

// light incidence direction (calculated in vertex shader, interpolated by rasterization)
in vec3 lightDir;
// the transformed normal has been calculated per-vertex in the vertex shader
in vec3 vNormal;
// the transformed smoothed normal has been calculated per-vertex in the vertex shader
in vec3 vSMNormal;
// vector from fragment to camera (in view coordinate)
in vec3 vViewPosition;

// ambient, diffusive and specular components (passed from the application)
uniform vec3 ambientColor;
uniform vec3 diffuseColor;
uniform vec3 specularColor;
// weight of the components
// in this case, we can pass separate values from the main application even if Ka+Kd+Ks>1. In more "realistic" situations, I have to set this sum = 1, or at least Kd+Ks = 1, by passing Kd as uniform, and then setting Ks = 1.0-Kd
uniform float Ka;
uniform float Kd;
uniform float Ks;

//TODO: Fix This
// shininess coefficients (passed from the application)
uniform float shininess;

// uniforms for GGX model
uniform float alpha; // rugosity - 0 : smooth, 1: rough
uniform float F0; // fresnel reflectance at normal incidence

////////////////////////////////////////////////////////////////////

// the "type" of the Subroutine
subroutine vec3 ill_model();

// Subroutine Uniform (it is conceptually similar to a C pointer function)
subroutine uniform ill_model Illumination_Model;

////////////////////////////////////////////////////////////////////

//////////////////////////////////////////
// a subroutine for the Lambert model
subroutine(ill_model)
vec3 Lambert() // this name is the one which is detected by the SetupShaders() function in the main application, and the one used to swap subroutines
{
    // normalization of the per-fragment normal
    vec3 N = normalize(vNormal);
    // normalization of the per-fragment light incidence direction
    vec3 L = normalize(lightDir.xyz);

    // Lambert coefficient
    float lambertian = max(dot(L,N), 0.0);

    // Lambert illumination model  
    return vec3(Kd * lambertian * diffuseColor);
}
//////////////////////////////////////////

//////////////////////////////////////////
// a subroutine for the Blinn-Phong model
subroutine(ill_model)
vec3 BlinnPhong() // this name is the one which is detected by the SetupShaders() function in the main application, and the one used to swap subroutines
{
    // ambient component can be calculated at the beginning
    vec3 color = Ka*ambientColor;

    // normalization of the per-fragment normal
    vec3 N = normalize(vNormal);

    // normalization of the per-fragment light incidence direction
    vec3 L = normalize(lightDir.xyz);

    // Lambert coefficient
    float lambertian = max(dot(L,N), 0.0);

    // if the lambert coefficient is positive, then I can calculate the specular component
    if(lambertian > 0.0)
    {
      // the view vector has been calculated in the vertex shader, already negated to have direction from the mesh to the camera
      vec3 V = normalize( vViewPosition );

      // in the Blinn-Phong model we do not use the reflection vector, but the half vector
      vec3 H = normalize(L + V);

      // we use H to calculate the specular component
      float specAngle = max(dot(H, N), 0.0);
      // shininess application to the specular component
      float specular = pow(specAngle, shininess);

      // We add diffusive and specular components to the final color
      // N.B. ): in this implementation, the sum of the components can be different than 1
      color += vec3( Kd * lambertian * diffuseColor +
                      Ks * specular * specularColor);
    }
    return color;
}
//////////////////////////////////////////

//////////////////////////////////////////
// a subroutine for the Enhanced-Blinn-Phong model
subroutine(ill_model)
vec3 EnhancedBlinnPhong() // this name is the one which is detected by the SetupShaders() function in the main application, and the one used to swap subroutines
{
  // ambient component can be calculated at the beginning
  vec3 color = Ka*ambientColor;

  //TODO: Add comments and fix variable names
  vec3 mask = vNormal - vSMNormal;
  vec3 unsharp_Normal = vNormal + 2*mask;
  // normalization of the per-fragment normal
  vec3 N = normalize(unsharp_Normal);

  // normalization of the per-fragment light incidence direction
  vec3 L = normalize(lightDir.xyz);

  //TODO: Add comments and fix variable names
  // Compute curvature
  vec3 dx = dFdx(N);
  vec3 dy = dFdy(N);
  vec3 xneg = N - dx;
  vec3 xpos = N + dx;
  vec3 yneg = N - dy;
  vec3 ypos = N + dy;
  float curvature = (cross(xneg, xpos).y - cross(yneg, ypos).x);

  curvature = clamp(curvature, -1, 1);
  float e = 2.718;
  float lambda = 0.7;
  float alpha = 2;
  //This calculation can be done in a separate function
  float P = pow (lambda * abs(curvature), alpha);
  float G1 = Ka / ( pow(e , P) * ( 1- Ka) + Ka);
  float G2 = Kd / ( pow(e , P) * ( 1- Kd) + Kd);
  float G3 = Ks / ( pow(e , P) * ( 1- Ks) + Ks);
  color=ambientColor*G1;
          
  // Lambert coefficient
  float lambertian = max(dot(L,N), 0.0);

  // if the lambert coefficient is positive, then I can calculate the specular component
  if(lambertian > 0.0)
  {
    // the view vector has been calculated in the vertex shader, already negated to have direction from the mesh to the camera
    vec3 V = normalize( vViewPosition );

    // in the Blinn-Phong model we do not use the reflection vector, but the half vector
    vec3 H = normalize(L + V);

    // we use H to calculate the specular component
    float specAngle = max(dot(H, N), 0.0);
    // shininess application to the specular component
    float specular = pow(specAngle, shininess);
    // We add diffusive and specular components to the final color
    // N.B. ): in this implementation, the sum of the components can be different than 1
    color = color + vec3( lambertian * diffuseColor * G2) +
                    vec3( specular * specularColor * G3);
  }
  return color;
}
//////////////////////////////////////////

//////////////////////////////////////////
// Schlick-GGX method for geometry obstruction (used by GGX model)
float G1(float angle, float alpha)
{
    // in case of Image Based Lighting, the k factor is different:
    // usually it is set as k=(alpha*alpha)/2
    float r = (alpha + 1.0);
    float k = (r*r) / 8.0;

    float num   = angle;
    float denom = angle * (1.0 - k) + k;

    return num / denom;
}

//TODO: Add comments BUT IT WORKS
subroutine(ill_model)
vec3 ToonShader(){
	float intensity;
	vec3 color;
  vec3 L = normalize(lightDir.xyz);
  vec3 N = normalize(vNormal);
	intensity = dot(L,N);

	if (intensity > 0.95)
		color = vec3(1.0,0.5,0.5);
	else if (intensity > 0.5)
		color = vec3(0.6,0.3,0.3);
	else if (intensity > 0.25)
		color = vec3(0.4,0.2,0.2);
	else
		color = vec3(0.2,0.1,0.1);
	return color;

}

//TODO: Add comments BUT IT WORKS
subroutine(ill_model)
vec3 EnhancedToonShader(){
	float intensity;
	vec3 color;
  vec3 L = normalize(lightDir.xyz);
    //TODO: Add comments and fix variable names
  vec3 mask = vNormal - vSMNormal;
  vec3 unsharp_Normal = vNormal + 2*mask;
  // normalization of the per-fragment normal
  vec3 N = normalize(unsharp_Normal);
	intensity = dot(L,N);

  float r = 0.3f;
  float Ql = 4;
  intensity = floor(0.5 + (Ql * pow(intensity,r))) / Ql;

	if (intensity > 0.95)
		color = vec3(1.0,0.5,0.5);
	else if (intensity > 0.5)
		color = vec3(0.6,0.3,0.3);
	else if (intensity > 0.25)
		color = vec3(0.4,0.2,0.2);
	else
		color = vec3(0.2,0.1,0.1);
	return color;

}

//////////////////////////////////////////
// a subroutine for the GGX model
//subroutine(ill_model)
vec3 GGX() // this name is the one which is detected by the SetupShaders() function in the main application, and the one used to swap subroutines
{
    // normalization of the per-fragment normal
    vec3 N = normalize(vNormal);
    // normalization of the per-fragment light incidence direction
    vec3 L = normalize(lightDir.xyz);

    // cosine angle between direction of light and normal
    float NdotL = max(dot(N, L), 0.0);

    // diffusive (Lambert) reflection component
    vec3 lambert = (Kd*diffuseColor)/PI;

    // we initialize the specular component
    vec3 specular = vec3(0.0);

    // if the cosine of the angle between direction of light and normal is positive, then I can calculate the specular component
    if(NdotL > 0.0)
    {
        // the view vector has been calculated in the vertex shader, already negated to have direction from the mesh to the camera
        vec3 V = normalize( vViewPosition );

        // half vector
        vec3 H = normalize(L + V);

        // we implement the components seen in the slides for a PBR BRDF
        // we calculate the cosines and parameters to be used in the different components
        float NdotH = max(dot(N, H), 0.0);
        float NdotV = max(dot(N, V), 0.0);
        float VdotH = max(dot(V, H), 0.0);
        float alpha_Squared = alpha * alpha;
        float NdotH_Squared = NdotH * NdotH;

        // Geometric factor G2 
        // Smith’s method (uses Schlick-GGX method for both geometry obstruction and shadowing )
        float G2 = G1(NdotV, alpha)*G1(NdotL, alpha);

        // Rugosity D
        // GGX Distribution
        float D = alpha_Squared;
        float denom = (NdotH_Squared*(alpha_Squared-1.0)+1.0);
        D /= PI*denom*denom;

        // Fresnel reflectance F (approx Schlick)
        vec3 F = vec3(pow(1.0 - VdotH, 5.0));
        F *= (1.0 - F0);
        F += F0;

        // we put everything together for the specular component
        specular = (F * G2 * D) / (4.0 * NdotV * NdotL);
    }

    // the rendering equation is:
    // integral of: BRDF * Li * (cosine angle between N and L)
    // BRDF in our case is: the sum of Lambert and GGX
    // Li is considered as equal to 1: light is white, and we have not applied attenuation. With colored lights, and with attenuation, the code must be modified and the Li factor must be multiplied to finalColor
    return (lambert + specular)*NdotL;
}
//////////////////////////////////////////

// main
void main(void)
{
    // we call the pointer function Illumination_Model():
    // the subroutine selected in the main application will be called and executed
  	vec3 color = Illumination_Model(); 
  
    colorFrag = vec4(color, 1.0);
}
